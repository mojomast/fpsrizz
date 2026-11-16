"""Headless verification of the saved scene and exported GLBs."""
import bpy
import math
import os
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

HERE = os.path.dirname(os.path.abspath(__file__))
NAMES = ('knife', 'pistol', 'smg', 'assault_rifle', 'sniper_rifle', 'rocket_launcher')
bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'generic_weapons.blend'))
scene = bpy.context.scene
cam = scene.camera
expected = {}
for name in NAMES:
    root = bpy.data.objects[name + '_GRIP_ROOT']
    assert root.location.length < 1e-6
    objects = [o for o in root.children if o.type == 'MESH']
    assert objects
    expected[name] = sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects)
    corners = [o.matrix_world @ Vector(c) for o in objects for c in o.bound_box]
    lo = Vector(tuple(min(p[i] for p in corners) for i in range(3)))
    hi = Vector(tuple(max(p[i] for p in corners) for i in range(3)))
    target = (lo+hi)/2
    direction = Vector((.32,-1.45,1.15)).normalized()
    cam.rotation_euler = (-direction).to_track_quat('-Z','Y').to_euler()
    inv = cam.rotation_euler.to_matrix().transposed()
    half_fov = math.atan(cam.data.sensor_width/(2*cam.data.lens))
    distance = max(max(abs((inv@(p-target)).x),abs((inv@(p-target)).y))/.78/math.tan(half_fov)+(inv@(p-target)).z for p in corners)
    cam.location = target+direction*distance
    bpy.context.view_layer.update()
    top = max((world_to_camera_view(scene, cam, o.matrix_world @ v.co).y, o.name) for o in objects for v in o.data.vertices)
    print('SPRITE TOP', name, top[1], round(top[0], 4))
    assert ('blade' in top[1] if name == 'knife' else ('muzzle' in top[1] or (name == 'rocket_launcher' and 'front_shroud' in top[1]))), top

for name in NAMES:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=os.path.join(HERE, name+'.glb'))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    roots = [o for o in bpy.context.scene.objects if o.name == name+'_GRIP_ROOT']
    triangles = sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
    assert len(roots) == 1 and roots[0].location.length < 1e-5, name
    assert triangles == expected[name], (name, triangles, expected[name])
    assert all(o.parent == roots[0] for o in meshes), name
    print('GLB OK', name, triangles, 'triangles,', len(meshes), 'meshes, grip root at origin')
