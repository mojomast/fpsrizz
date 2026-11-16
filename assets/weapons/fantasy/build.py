"""Build the Gloamforge arsenal. Run with Blender 4.3 in background mode.

blender -b --python assets/weapons/fantasy/build.py
Outputs are always written alongside this file.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

OUT = Path(__file__).resolve().parent
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
    if c.name != 'Collection': bpy.data.collections.remove(c)
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
scene.world.color = (0.16, 0.16, 0.16)
scene.view_settings.view_transform = 'AgX'

def mat(name, color, metal=0.0, rough=.42, glow=0):
    m = bpy.data.materials.new(name); m.diffuse_color = (*color, 1); m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal; p.inputs['Roughness'].default_value = rough
    if glow:
        p.inputs['Emission Color'].default_value = (*color, 1); p.inputs['Emission Strength'].default_value = glow
    return m
iron = mat('01 | midnight iron', (.045,.065,.078), .72, .31)
edge = mat('02 | honed pewter', (.32,.42,.43), .75, .29)
gold = mat('03 | aged brass', (.57,.31,.095), .72, .34)
wood = mat('04 | oxblood lacquer', (.16,.045,.035), .18, .45)
leather = mat('05 | charcoal leather', (.045,.031,.032), .05, .65)
teal = mat('06 | witchglass', (.025,.65,.53), .25, .24, .35)
red = mat('07 | emberglass', (.93,.16,.035), .18, .25, .35)
black = mat('08 | bore shadow', (.009,.012,.017), .15, .6)

weapons = []
current = None
def begin(slug, title, role):
    global current
    coll = bpy.data.collections.new(slug); scene.collection.children.link(coll)
    root = bpy.data.objects.new(slug + '_GRIP_ROOT', None); coll.objects.link(root)
    current = {'slug':slug, 'title':title, 'role':role, 'collection':coll, 'root':root, 'parts':[]}
    weapons.append(current)

def register(obj, name, material):
    obj.name = name
    for c in list(obj.users_collection): c.objects.unlink(obj)
    current['collection'].objects.link(obj)
    obj.parent = current['root']
    obj.data.materials.append(material)
    current['parts'].append(obj)
    return obj

def box(name, loc, size, material, rot=(0,0,0), bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o=bpy.context.object; o.dimensions=size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod=o.modifiers.new('Forged corners', 'BEVEL'); mod.width=bevel; mod.segments=1
        mod.affect='EDGES'
        bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=mod.name)
    return register(o,name,material)

def cyl(name, loc, radius, depth, material, vertices=8, axis='Y', r2=None):
    rotation = (math.pi/2,0,0) if axis=='Y' else ((0,math.pi/2,0) if axis=='X' else (0,0,0))
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=r2, depth=depth, location=loc, rotation=rotation)
    return register(bpy.context.object,name,material)

def gem(name, loc, scale, material):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=loc)
    o=bpy.context.object; o.scale=scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return register(o,name,material)

def blade(name, points, material):
    # Polygon outline in XY, with a raised centre ridge; deliberate faceted forging.
    verts=[(x,y,0) for x,y in points]+[(0, sum(y for x,y in points)/len(points), .035)]
    n=len(points); faces=[(i,(i+1)%n,n) for i in range(n)]+[tuple(reversed(range(n)))]
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    o=bpy.data.objects.new(name,mesh); current['collection'].objects.link(o)
    return register(o,name,material)

def grip():
    box('Grip | wrapped heartwood',(0,0,-.075),(.105,.12,.27),wood,rot=(.20,0,0),bevel=.015)
    for z in [-.17,-.12,-.07,-.02]:
        box('Grip | dark binding',(0,0,z),(.113,.125,.017),leather,rot=(.20,0,0),bevel=.003)
    box('Grip | pommel',(0,-.025,-.225),(.13,.13,.035),gold,bevel=.009)

def receiver(length=.39, width=.17, height=.15):
    box('Receiver | forged iron',(0,.19,.085),(width,length,height),iron,bevel=.025)
    box('Receiver | raised spine',(0,.19,.17),(width*.58,length*.83,.035),gold,bevel=.009)
    for x in [-width/2-.003,width/2+.003]:
        box('Receiver | lacquer sideplate',(x,.18,.085),(.014,length*.66,height*.57),wood,bevel=.009)
        gem('Receiver | witchglass seal',(x*1.13,.18,.09),(.018,.045,.045),teal)

def barrel(y, length, radius=.045):
    cyl('Barrel | iron', (0,y,.105),radius,length,iron,10)
    cyl('Muzzle | brass ferrule',(0,y+length/2-.025,.105),radius*1.30,.05,gold,10)
    cyl('Muzzle | dark bore',(0,y+length/2+.001,.105),radius*.72,.003,black,10)

def stock(length=.29):
    box('Stock | wood',(0,-length/2-.055,.06),(.115,length,.12),wood,rot=(-.08,0,0),bevel=.02)
    box('Stock | brass butt',(0,-length-.065,.04),(.13,.035,.15),gold,bevel=.012)

def rib(y, width=.19, z=.09):
    box('Rib | crosswise brass',(0,y,z),(width,.025,.16),gold,bevel=.008)

# Each silhouette and mechanical language is invented for this set.
begin('01_thornwake','Thornwake','knife')
grip()
box('Guard | swept quillons',(0,.095,.015),(.32,.045,.045),gold,bevel=.012)
for x in [-.13,.13]: gem('Guard | cut finial',(x,.095,.015),(.035,.035,.035),teal)
blade('Blade | leaf of blackened silver',[(0,.12),(-.085,.22),(-.095,.40),(-.06,.60),(0,.77),(.06,.60),(.095,.40),(.085,.22)],edge)
blade('Blade | raised dark fuller',[(0,.17),(-.018,.27),(-.02,.49),(0,.68),(.02,.49),(.018,.27)],iron)
gem('Blade | embedded seal',(0,.22,.046),(.022,.04,.015),teal)

begin('02_cinderkey','Cinderkey','pistol')
grip(); receiver(.27,.16,.15); barrel(.43,.35,.043)
box('Hammer | cocked brass',(0,-.045,.20),(.055,.07,.10),gold,rot=(.25,0,0),bevel=.01)
cyl('Chamber | side wheel',(.10,.19,.085),.065,.035,gold,10,'X')
cyl('Chamber | ember',(.121,.19,.085),.035,.005,red,8,'X')
rib(.32,.20)

begin('03_mothspindle','Mothspindle','SMG')
grip(); receiver(.36,.17,.15); barrel(.50,.34,.044); stock(.20)
for x in [-.13,.13]:
    cyl('Feed | side spindle',(x,.23,.085),.068,.24,wood,8)
    for y in [.12,.23,.34]: cyl('Feed | retaining ring',(x,y,.085),.073,.018,gold,8)
    gem('Feed | witchglass end',(x,.357,.085),(.045,.018,.045),teal)
box('Magazine | hanging crystal',(0,.30,-.08),(.10,.12,.25),iron,rot=(.12,0,0),bevel=.012)
gem('Magazine | glass core',(0,.30,-.14),(.065,.07,.10),teal)

begin('04_briarward','Briarward','assault')
grip(); receiver(.43,.18,.17); barrel(.67,.53,.045); stock(.33)
box('Foregrip | wood shroud',(0,.51,.07),(.14,.24,.13),wood,bevel=.02)
for y in [.44,.52,.60]: rib(y,.17,.08)
box('Magazine | curved rune',(0,.30,-.11),(.115,.14,.30),wood,rot=(-.20,0,0),bevel=.015)
box('Magazine | brass foot',(0,.33,-.26),(.13,.15,.025),gold,bevel=.005)
for y in [.25,.34]: gem('Magazine | inset scale',(.06,y,-.09),(.012,.025,.04),teal)
box('Sight | rear',(0,.04,.22),(.09,.04,.05),gold,bevel=.005)

begin('05_faroracle','Far Oracle','sniper')
grip(); receiver(.48,.16,.14); barrel(.83,.91,.034); stock(.45)
box('Fore end | long wood',(0,.55,.055),(.11,.42,.10),wood,bevel=.015)
for y in [.38,.61,.82]: cyl('Barrel | gold collar',(0,y,.105),.044,.022,gold,8)
for y in [.15,.39]: box('Optic | mount',(0,y,.20),(.065,.04,.10),gold,bevel=.006)
cyl('Optic | long tube',(0,.28,.26),.052,.40,iron,10)
for y in [.09,.47]: cyl('Optic | rim',(0,y,.26),.065,.04,gold,10)
cyl('Optic | lens',(0,.492,.26),.047,.004,teal,10)
gem('Optic | floating focus',(0,.28,.32),(.035,.035,.025),teal)

begin('06_ashbell','Ashbell','rocket')
grip(); stock(.27)
cyl('Bell | main crucible',(0,.39,.13),.15,.64,iron,10)
for y in [.10,.29,.49,.66]: cyl('Bell | gilded hoops',(0,y,.13),.16,.035,gold,10)
cyl('Bell | flared mouth',(0,.79,.13),.22,.23,wood,10,r2=.15)
cyl('Bell | lip',(0,.91,.13),.225,.035,gold,10)
cyl('Bell | black aperture',(0,.929,.13),.17,.004,black,10)
cyl('Bell | ember at throat',(0,.932,.13),.065,.005,red,8)
for x in [-.155,.155]:
    box('Bell | iron wing',(x,.40,.13),(.05,.30,.21),wood,bevel=.018)
    gem('Bell | side furnace',(x*1.17,.40,.14),(.04,.075,.075),red)
box('Bell | carry arch',(0,.30,.305),(.11,.25,.035),gold,bevel=.01)

# Camera and soft studio lighting are kept outside exported collections.
def aim(o, target): o.rotation_euler = (Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
def light(name, loc, power, size, target):
    data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.shape='DISK'; data.size=size
    ob=bpy.data.objects.new(name,data); scene.collection.objects.link(ob); ob.location=loc; aim(ob,target)
light('Studio | key',(-2,-1,3),450,3,(0,.35,0))
light('Studio | fill',(2,-.5,1.5),260,2,(0,.3,0))
light('Studio | rim',(0,2,2.5),500,2,(0,.4,0))
camera_data=bpy.data.cameras.new('First person studio camera'); camera=bpy.data.objects.new('First person studio camera',camera_data)
scene.collection.objects.link(camera); scene.camera=camera
camera_data.lens=38

stats={}
for w in weapons:
    for other in weapons: other['collection'].hide_render = other is not w
    # In line with the bore and above the grip: forward end rises in the frame.
    bpy.context.view_layer.update()
    corners=[o.matrix_world @ Vector(corner) for o in w['parts'] for corner in o.bound_box]
    lo=min(v.y for v in corners); hi=max(v.y for v in corners)
    zlo=min(v.z for v in corners); zhi=max(v.z for v in corners)
    target=Vector((0,(lo+hi)/2,(zlo+zhi)/2))
    camera.location=(.45,lo-2.0,target.z+1.0); aim(camera,target)
    # Fit all bounding corners to a consistent margin, including zooming in.
    bpy.context.view_layer.update()
    p=[world_to_camera_view(scene,camera,v) for v in corners]
    span=max(max(abs(v.x-.5),abs(v.y-.5)) for v in p)
    camera_data.lens *= .41/span
    bpy.context.view_layer.update()
    scene.render.filepath=str(OUT/(w['slug']+'.png'))
    bpy.ops.render.render(write_still=True)
    camera_data.lens=38
    bpy.ops.object.select_all(action='DESELECT')
    w['root'].select_set(True)
    for ob in w['parts']: ob.select_set(True)
    bpy.context.view_layer.objects.active=w['root']
    bpy.ops.export_scene.gltf(filepath=str(OUT/(w['slug']+'.glb')), export_format='GLB', use_selection=True, export_yup=True)
    tri=sum(len(o.data.loop_triangles) for o in [])
    for o in w['parts']: o.data.calc_loop_triangles()
    stats[w['slug']]={'title':w['title'],'role':w['role'],'objects':len(w['parts']),
                      'triangles':sum(len(o.data.loop_triangles) for o in w['parts'])}

for w in weapons: w['collection'].hide_render=False
scene.render.filepath='//01_thornwake.png'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'gloamforge_arsenal.blend'))
(OUT/'stats.json').write_text(json.dumps(stats,indent=2)+'\n')
print('ARSENAL_STATS', json.dumps(stats))
