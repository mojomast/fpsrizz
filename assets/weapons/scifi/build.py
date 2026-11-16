"""Build and render the Eidolon Foundry weapons with Blender 4.3.

Run: blender -b --factory-startup --python assets/weapons/scifi/build.py
All paths are resolved relative to this script, not the current directory.
"""
import bpy
import math
import json
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

OUT = Path(__file__).resolve().parent
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.name != 'Collection':
        bpy.data.collections.remove(collection)
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
scene.view_settings.view_transform = 'AgX'
scene.world.color = (0.16, 0.16, 0.16)

def material(name, color, metallic=0.0, roughness=.42, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = roughness
    if emission:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = emission
    return m

M = {
    'shell': material('ceramic | bone', (.63, .67, .60), .35),
    'dark': material('frame | midnight', (.022, .039, .055), .45),
    'edge': material('alloy | blue graphite', (.085, .16, .19), .72, .28),
    'grip': material('grip | ink rubber', (.025, .035, .04), .05, .8),
    'light': material('signal | ion cyan', (.015, .76, .8), .15, .25, 2.4),
    'amber': material('warning | tangerine', (1.0, .24, .025), .25, .35, .3),
    'glass': material('optic | deep teal', (.012, .20, .23), .6, .18),
}

current = None
root = None
def link(obj, name, mat):
    obj.name = name
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    current.objects.link(obj)
    obj.parent = root
    obj.data.materials.append(M[mat])
    return obj

def box(name, pos, size, mat, bevel=.012, rotation=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    ob = bpy.context.object
    ob.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = ob.modifiers.new('single-plane edge chamfer', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if rotation:
        ob.rotation_euler = rotation
    return link(ob, name, mat)

def cylinder(name, pos, radius, depth, mat, vertices=8, axis='Y'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=pos,
        rotation=(math.pi/2, 0, 0) if axis == 'Y' else (0, math.pi/2, 0))
    return link(bpy.context.object, name, mat)

def hull(name, sections, mat):
    # Each section: y, half width, bottom, top. Closed faceted tapered housing.
    verts=[]
    for y,w,z0,z1 in sections:
        verts.extend([(-w,y,z0),(w,y,z0),(w,y,z1),(-w,y,z1)])
    faces=[(3,2,1,0)]
    for i in range(len(sections)-1):
        a=i*4; b=a+4
        faces += [(a,b,b+1,a+1),(a+1,b+1,b+2,a+2),(a+2,b+2,b+3,a+3),(a+3,b+3,b,a)]
    a=(len(sections)-1)*4
    faces.append((a,a+1,a+2,a+3))
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts, [], faces); mesh.update()
    ob=bpy.data.objects.new(name, mesh); current.objects.link(ob); ob.parent=root
    ob.data.materials.append(M[mat]); return ob

def grip():
    box('grip', (0, -.025, -.10), (.115,.13,.26), 'grip', .015, (math.radians(-12),0,0))
    box('grip heel', (0, -.055, -.245), (.13,.14,.035), 'edge', .009)
    for z in [-.07,-.11,-.15,-.19]:
        box('grip rib', (.059,-.03,z), (.009,.09,.008), 'shell', .002)

def ring(y,z,r,depth=.055):
    cylinder('muzzle collar', (0,y,z), r, depth, 'shell', 8)
    cylinder('muzzle aperture', (0,y+depth/2+.002,z), r*.7, .006, 'dark', 8)
    cylinder('muzzle ion core', (0,y+depth/2+.006,z), r*.36, .004, 'light', 8)

def stripe(y,z,length, x, mat='light'):
    box('luminous flank', (x,y,z), (.007,length,.014), mat, .002)

def pistol():
    grip()
    hull('upper receiver', [(-.15,.08,.04,.18),(.17,.085,.04,.19),(.32,.06,.07,.16)], 'shell')
    box('slide back', (0,-.045,.195), (.14,.19,.035), 'edge')
    box('lower frame', (0,.08,.02), (.11,.26,.07), 'dark')
    cylinder('barrel', (0,.30,.115), .042,.18,'edge')
    ring(.395,.115,.055,.035)
    stripe(.06,.13,.21,.087)
    box('rear notch', (0,-.10,.225), (.08,.045,.025), 'dark', .004)
    box('charge cell', (.075,-.04,.06), (.018,.075,.035), 'amber', .003)

def smg():
    grip()
    hull('compact receiver', [(-.19,.09,.02,.18),(.18,.10,.03,.19),(.36,.065,.07,.16)], 'edge')
    box('upper shell', (0,.025,.19), (.19,.40,.065), 'shell')
    box('rear brace', (0,-.25,.12), (.11,.18,.10), 'dark')
    box('battery magazine', (0,.13,-.075), (.09,.12,.25), 'shell', .012, (math.radians(8),0,0))
    box('magazine inset', (.049,.13,-.075), (.008,.07,.14), 'amber', .003)
    cylinder('barrel', (0,.38,.115), .042,.18,'dark')
    ring(.48,.115,.063,.055)
    for y in [.21,.26,.31]:
        box('cooling slit', (.102,y,.145), (.006,.018,.038), 'dark', .001)
    stripe(-.02,.20,.25,.099)

def assault():
    grip()
    hull('receiver', [(-.28,.085,.02,.18),(.18,.10,.01,.21),(.47,.075,.07,.18)], 'dark')
    hull('upper carapace', [(-.24,.09,.17,.22),(.16,.105,.18,.25),(.39,.08,.16,.21)], 'shell')
    box('stock', (0,-.31,.105), (.105,.28,.13), 'edge')
    box('butt pad', (0,-.46,.10), (.14,.05,.17), 'grip')
    box('energy magazine', (0,.12,-.075), (.11,.15,.24), 'edge', .014, (math.radians(12),0,0))
    box('magazine indicator', (.057,.12,-.07), (.008,.09,.12), 'light', .003)
    cylinder('long barrel', (0,.47,.13), .045,.31,'edge')
    ring(.635,.13,.065,.055)
    for y in [.26,.32,.38]:
        box('forward vent', (.079,y,.15), (.008,.025,.035), 'amber', .003)
    stripe(-.03,.215,.30,.105)
    box('rear sight', (0,-.18,.245), (.065,.06,.035), 'dark')

def sniper():
    grip()
    hull('long receiver', [(-.31,.075,.03,.16),(.15,.09,.02,.18),(.42,.055,.07,.16)], 'edge')
    box('shoulder stock', (0,-.36,.10), (.10,.28,.10), 'shell')
    box('stock heel', (0,-.51,.09), (.13,.05,.15), 'grip')
    box('lower cell', (0,.10,-.04), (.10,.18,.14), 'dark')
    box('upper rail', (0,-.03,.19), (.08,.36,.04), 'dark')
    cylinder('optic housing', (0,-.02,.245), .065,.25,'dark', 10)
    cylinder('optic lens rear', (0,-.15,.245), .049,.008,'glass', 10)
    cylinder('optic band', (0,.07,.245), .073,.035,'shell', 10)
    cylinder('precision barrel', (0,.56,.12), .029,.52,'edge', 8)
    cylinder('barrel sleeve', (0,.39,.12), .057,.15,'shell', 8)
    ring(.835,.12,.065,.06)
    stripe(.04,.12,.24,.092)
    for y in [.45,.52,.59]:
        box('barrel light', (.031,y,.13), (.008,.028,.012), 'light', .001)

def rocket():
    grip()
    cylinder('accelerator tube', (0,.20,.16), .14,.78,'edge', 10)
    cylinder('aft shroud', (0,-.13,.16), .16,.16,'shell', 10)
    cylinder('forward shroud', (0,.49,.16), .165,.19,'shell', 10)
    ring(.60,.16,.172,.06)
    box('underslung frame', (0,.18,-.005), (.16,.53,.12), 'dark')
    box('power pack', (0,.12,-.12), (.16,.18,.17), 'shell')
    box('pack warning', (.083,.12,-.11), (.008,.10,.09), 'amber', .002)
    for x in [-.13,.13]:
        box('tube rail', (x,.20,.16), (.05,.42,.055), 'dark')
        stripe(.2,.17,.28,x + (-.027 if x<0 else .027))
    box('top warning ridge', (0,.10,.305), (.065,.25,.035), 'amber')

def knife():
    box('handle', (0,-.015,-.025), (.09,.23,.10), 'grip')
    for y in [-.09,-.045,0,.045]:
        box('handle rib', (.047,y,-.025), (.008,.012,.075), 'edge', .001)
    box('pommel', (0,-.15,-.025), (.12,.055,.13), 'shell')
    box('cross guard', (0,.12,0), (.23,.05,.045), 'edge')
    hull('phase blade', [(.14,.07,-.018,.035),(.40,.065,-.012,.025),(.58,.012,0,.008),(.61,.001,.003,.005)], 'shell')
    hull('energy fuller', [(.18,.025,.036,.041),(.40,.022,.026,.031),(.55,.004,.009,.013)], 'light')
    box('blade emitter', (0,.145,.005), (.10,.04,.07), 'amber')

WEAPONS = [
    ('01_vigil_knife','VIGIL / phase knife', knife),
    ('02_spark_pistol','SPARK / arc pistol', pistol),
    ('03_flicker_smg','FLICKER / pulse SMG', smg),
    ('04_lattice_assault','LATTICE / coil assault', assault),
    ('05_parallax_sniper','PARALLAX / rail sniper', sniper),
    ('06_cairn_rocket','CAIRN / void rocket', rocket),
]

# Lighting belongs to the scene, never to the exported collection.
def area(name, location, energy, size, target):
    data=bpy.data.lights.new(name,'AREA'); data.energy=energy; data.shape='DISK'; data.size=size
    ob=bpy.data.objects.new(name,data); scene.collection.objects.link(ob); ob.location=location
    ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
area('softbox key', (1,-.8,2.7), 230, 2.1, (0,.2,0))
area('cool fill', (-1,.5,1.4), 140, 1.8, (0,.2,0))
area('rim', (.3,1.7,1.5), 180, 1.4, (0,.2,0))
camdata=bpy.data.cameras.new('first person preview'); cam=bpy.data.objects.new('first person preview',camdata)
scene.collection.objects.link(cam); scene.camera=cam; camdata.type='PERSP'; camdata.lens=48

def aim_camera(objects):
    points=[ob.matrix_world @ Vector(corner) for ob in objects for corner in ob.bound_box]
    lo=Vector(tuple(min(p[i] for p in points) for i in range(3)))
    hi=Vector(tuple(max(p[i] for p in points) for i in range(3)))
    target=(lo+hi)*.5
    # Looking forward and downward ensures +Y points up in the sprite.
    direction=Vector((.23,-1.45,1.14)).normalized()
    distance=.6
    for _ in range(100):
        cam.location=target+direction*distance
        cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
        bpy.context.view_layer.update()
        coords=[world_to_camera_view(scene,cam,p) for p in points]
        if all(.075 < q.x < .925 and .075 < q.y < .925 and q.z > 0 for q in coords): break
        distance *= 1.045

manifest=[]
collections=[]
for slug,label,make in WEAPONS:
    current=bpy.data.collections.new(slug); scene.collection.children.link(current); collections.append(current)
    root=bpy.data.objects.new(slug+'_grip_root', None); current.objects.link(root)
    root.empty_display_type='PLAIN_AXES'; root.empty_display_size=.08
    make()
    bpy.context.view_layer.update()
    meshes=[o for o in current.objects if o.type=='MESH']
    triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
    for c in collections:
        c.hide_render = (c != current)
    aim_camera(meshes)
    target_mesh=next(o for o in meshes if o.name.startswith('phase blade' if slug.startswith('01_') else 'muzzle collar'))
    projected=[world_to_camera_view(scene, cam, target_mesh.matrix_world @ Vector(p)) for p in target_mesh.bound_box]
    feature_bounds=[round(min(q.x for q in projected)*512,1), round((1-max(q.y for q in projected))*512,1),
                    round(max(q.x for q in projected)*512,1), round((1-min(q.y for q in projected))*512,1)]
    scene.render.filepath=str(OUT/(slug+'.png'))
    bpy.ops.render.render(write_still=True)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in current.objects: ob.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=str(OUT/(slug+'.glb')), export_format='GLB', use_selection=True,
        export_yup=True, export_apply=True, export_cameras=False, export_lights=False)
    manifest.append({'name':label,'slug':slug,'mesh_objects':len(meshes),'triangles':triangles,
                     'tip_or_muzzle_projected_bounds_px':feature_bounds})

for c in collections: c.hide_render=False
# Overlapping collections share a grip origin; toggle collections to inspect individually.
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'eidolon_foundry.blend'))
print('WEAPON_COUNTS',json.dumps(manifest))
