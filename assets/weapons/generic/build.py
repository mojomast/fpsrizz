"""Run with Blender in background: blender -b --python build.py

All dimensions are meters. Weapons share a grip origin and point along +Y.
"""
import bpy
import math
import os
from mathutils import Vector

OUT = os.path.dirname(os.path.abspath(__file__))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
    for item in list(datablocks):
        if item.users == 0:
            datablocks.remove(item)

scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = True
scene.world.color = (0.15, 0.15, 0.15)
scene.view_settings.view_transform = 'AgX'

def material(name, color, metallic=0, roughness=.55):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    return mat

steel = material('01 | blue-black enamel', (.075, .115, .14), .65, .4)
edge = material('02 | machined titanium', (.36, .45, .46), .75, .32)
dark = material('03 | graphite rubber', (.035, .047, .052), .1, .8)
accent = material('04 | signal vermilion', (.8, .16, .065), .25, .45)
warm = material('05 | warm ivory markings', (.76, .72, .58), .15, .5)
glass = material('06 | opaque cyan optic', (.035, .43, .48), .5, .22)

roots = {}
parts = {}
current = None

def start(name):
    global current
    current = name
    root = bpy.data.objects.new(name + '_GRIP_ROOT', None)
    bpy.context.collection.objects.link(root)
    roots[name] = root
    parts[name] = [root]

def finish(obj, name, mat):
    obj.name = current + '_' + name
    obj.data.materials.append(mat)
    # Keep each mesh separately editable; retain world transform on parenting.
    obj.parent = roots[current]
    parts[current].append(obj)
    return obj

def box(name, loc, size, mat, bevel=0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('single-cut chamfer', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
        mod.affect = 'EDGES'
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(obj, name, mat)

def cyl(name, loc, radius, depth, mat, vertices=8, axis='Y'):
    rotation = (math.pi/2, 0, 0) if axis == 'Y' else (0, 0, 0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation)
    return finish(bpy.context.object, name, mat)

def ring(name, y, z, outer, inner, depth, mat, n=8):
    verts = []
    for yy, r in ((y-depth/2, outer), (y+depth/2, outer), (y-depth/2, inner), (y+depth/2, inner)):
        for i in range(n):
            a = 2*math.pi*i/n + math.pi/8
            verts.append((math.cos(a)*r, yy, z+math.sin(a)*r))
    faces = []
    for i in range(n):
        j = (i+1)%n
        faces.extend(((i,j,n+j,n+i), (2*n+j,2*n+i,3*n+i,3*n+j),
                      (n+i,n+j,3*n+j,3*n+i), (j,i,2*n+i,2*n+j)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj, name, mat)
    cyl(name+'_bore', (0, y+depth/2-.003, z), inner*.99, .003, dark)

def grip(y=0, z=-.07, scale=1):
    box('grip', (0,y,z), (.095*scale,.115*scale,.22*scale), dark, .015*scale, (math.radians(-12),0,0))
    for dz in (-.045, 0, .045):
        box('grip_inlay', (.049*scale,y-.008*scale,z+dz*scale), (.004,.07*scale,.006*scale), edge)
        box('grip_inlay_L', (-.049*scale,y-.008*scale,z+dz*scale), (.004,.07*scale,.006*scale), edge)

def receiver(y, length, width, height, z=0):
    box('receiver', (0,y,z), (width,length,height), steel, .014)
    box('upper_spine', (0,y,z+height*.48), (width*.72,length*.86,.025), edge, .006)
    for side in (-1,1):
        box('side_panel', (side*(width/2+.002),y,z), (.006,length*.48,height*.48), dark, .002)
        box('stripe', (side*(width/2+.006),y+.035,z+.015), (.003,length*.22,.012), accent)

def muzzle(y,z,r):
    ring('muzzle', y, z, r, r*.55, .035, edge)
    ring('muzzle_collar', y-.032, z, r*1.07, r*.69, .014, accent)

def stock(y, length, z=0):
    box('stock_neck', (0,y,z), (.075,length,.085), steel, .01)
    box('stock_pad', (0,y-length/2,z-.025), (.105,.035,.16), dark, .01)
    box('stock_cheek', (0,y-.02,z+.055), (.075,length*.55,.035), edge, .008)

def magazine(y,z=-.15, length=.18):
    box('magazine', (0,y,z), (.07,.105,length), dark, .01, (math.radians(-7),0,0))
    box('magazine_base', (0,y-.012,z-length/2), (.08,.12,.018), accent, .004)

def sights(y_back,y_front,z):
    box('rear_sight', (0,y_back,z), (.08,.025,.025), dark, .004)
    box('rear_sight_mark', (0,y_back-.014,z+.008), (.022,.004,.006), warm)
    box('front_sight', (0,y_front,z), (.025,.025,.023), dark, .003)
    box('front_sight_mark', (0,y_front-.014,z+.006), (.01,.004,.008), accent)

# All designs are invented blocky industrial shapes, with a common color language.
start('knife')
grip(0,-.025,.85)
box('pommel', (0,-.068,-.025), (.095,.025,.1), edge, .006)
box('guard', (0,.09,0), (.16,.027,.035), accent, .005)
# Faceted, asymmetric spear-point blade, with a raised center ridge.
verts = [(-.046,.105,0),(.046,.105,0),(-.039,.34,0),(.039,.34,0),(0,.48,0),
         (0,.12,.019),(0,.33,.016),(0,.12,-.014),(0,.33,-.012)]
faces = [(0,5,6,2),(5,1,3,6),(2,6,4),(6,3,4),(7,0,2,8),(1,7,8,3),(8,2,4),(3,8,4),(0,7,1,5)]
mesh=bpy.data.meshes.new('blade_mesh'); mesh.from_pydata(verts,[],faces); mesh.update()
obj=bpy.data.objects.new('blade',mesh); bpy.context.collection.objects.link(obj); finish(obj,'blade',edge)
box('blade_spine_inlay',(0,.23,.018),(.012,.16,.004),accent)

start('pistol')
grip()
receiver(.075,.27,.105,.105,.045)
box('slide', (0,.10,.105), (.105,.23,.055), edge, .009)
box('slide_insert', (0,.115,.134), (.045,.15,.006), steel, .002)
for yy in (-.005,.015,.035):
    box('slide_groove', (.055,yy,.11), (.003,.006,.025), dark)
cyl('barrel', (0,.24,.07), .026,.11, steel)
muzzle(.305,.07,.035)
sights(.015,.19,.137)

start('smg')
grip()
receiver(.13,.34,.13,.13,.045)
stock(-.17,.24,.045)
magazine(.14,-.14,.20)
box('foregrip', (0,.29,-.045), (.075,.09,.12), dark, .01)
cyl('barrel', (0,.36,.05), .03,.20, steel)
muzzle(.48,.05,.042)
sights(.02,.34,.125)

start('assault_rifle')
grip()
receiver(.16,.39,.14,.14,.055)
stock(-.20,.30,.055)
magazine(.17,-.15,.22)
box('handguard', (0,.43,.05), (.12,.26,.12), steel, .016)
for yy in (.35,.40,.45,.50):
    box('vent', (.062,yy,.075), (.004,.018,.028), dark)
    box('vent_L', (-.062,yy,.075), (.004,.018,.028), dark)
cyl('barrel', (0,.60,.055), .026,.19, edge)
muzzle(.71,.055,.038)
sights(.015,.52,.145)

start('sniper_rifle')
grip()
receiver(.18,.40,.13,.13,.05)
stock(-.23,.35,.05)
box('stock_spine',(0,-.27,.13),(.08,.24,.045),steel,.009)
magazine(.19,-.095,.12)
box('fore_end', (0,.49,.02), (.105,.35,.09), steel, .01)
cyl('barrel', (0,.68,.055), .024,.42, edge)
muzzle(.91,.055,.04)
# Low, offset optic sits below the projected muzzle in the sprite.
cyl('scope_body',(0,.22,.155),.043,.24,dark)
ring('scope_front',.35,.155,.052,.035,.02,edge)
cyl('scope_glass',(0,.361,.155),.034,.004,glass)
box('scope_mount',(0,.18,.115),(.04,.08,.06),steel)

start('rocket_launcher')
grip(0,-.13,1.1)
cyl('main_tube',(0,.20,.08),.105,.75,steel,12)
ring('front_shroud',.605,.08,.13,.092,.075,edge,12)
ring('safety_band',.53,.08,.113,.104,.04,accent,12)
ring('rear_shroud',-.20,.08,.12,.09,.06,dark,12)
box('lower_housing',(0,.15,-.045),(.13,.36,.10),dark,.015)
box('top_carry_rail',(0,.08,.19),(.08,.28,.035),edge,.008)
box('rail_stripe',(0,.12,.211),(.035,.12,.005),accent)
for side in (-1,1):
    box('tube_mark', (side*.103,.25,.08),(.004,.18,.025),warm)
box('forward_grip',(0,.37,-.12),(.07,.09,.16),dark,.01)

# Studio lights are not exported. Camera looks from the grip toward +Y.
def area(name, loc, power, size, target):
    data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.shape='DISK'; data.size=size
    ob=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(ob); ob.location=loc
    ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
area('large softbox', (1.5,-1,2.5), 110, 3, (0,.25,0))
area('cool fill', (-2,.6,1.2), 65, 2, (0,.25,0))
area('rim', (.5,2,1.7), 90, 2, (0,.2,0))
camdata=bpy.data.cameras.new('Viewmodel camera'); cam=bpy.data.objects.new('Viewmodel camera',camdata)
bpy.context.collection.objects.link(cam); scene.camera=cam; camdata.type='PERSP'; camdata.lens=48

report=[]
for name, objects in parts.items():
    for other, obs in parts.items():
        for ob in obs:
            ob.hide_render = other != name
            ob.hide_set(False)
    bpy.context.view_layer.update()
    # Frame all mesh bounding box corners in perspective, retaining identical camera angle.
    corners=[ob.matrix_world @ Vector(corner) for ob in objects if ob.type=='MESH' for corner in ob.bound_box]
    lo=Vector(tuple(min(p[i] for p in corners) for i in range(3)))
    hi=Vector(tuple(max(p[i] for p in corners) for i in range(3)))
    target=(lo+hi)/2
    direction=Vector((.32,-1.45,1.15)).normalized()
    cam.rotation_euler=(-direction).to_track_quat('-Z','Y').to_euler()
    inv=cam.rotation_euler.to_matrix().transposed()
    # Camera FOV is square. Fit every corner with 12% margin.
    half_fov=math.atan(camdata.sensor_width/(2*camdata.lens))
    distance=max((max(abs((inv@(p-target)).x), abs((inv@(p-target)).y))/.78/math.tan(half_fov)+(inv@(p-target)).z) for p in corners)
    cam.location=target+direction*distance
    scene.render.filepath=os.path.join(OUT,name+'.png')
    bpy.ops.render.render(write_still=True)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects: ob.select_set(True)
    bpy.context.view_layer.objects.active=roots[name]
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,name+'.glb'), export_format='GLB', use_selection=True, export_yup=True)
    triangles=sum(sum(len(poly.vertices)-2 for poly in ob.data.polygons) for ob in objects if ob.type=='MESH')
    report.append(f'{name}: {triangles} triangles, {len(objects)-1} mesh objects; bounds {tuple(round(x,3) for x in lo)} to {tuple(round(x,3) for x in hi)} m')

for objects in parts.values():
    for ob in objects: ob.hide_render=False
with open(os.path.join(OUT,'counts.txt'),'w',encoding='utf8') as f: f.write('\n'.join(report)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'generic_weapons.blend'))
print('\n'.join(report))
