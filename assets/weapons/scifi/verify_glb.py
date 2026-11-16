"""Round-trip each export in a fresh Blender session and record its geometry."""
import bpy
import json
from pathlib import Path
from mathutils import Vector

out=Path(__file__).resolve().parent
manifest=json.loads((out/'manifest.json').read_text())
results=[]
for item in manifest:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(out/(item['slug']+'.glb')))
    bpy.context.view_layer.update()
    meshes=[ob for ob in bpy.context.scene.objects if ob.type=='MESH']
    tris=sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in meshes)
    assert len(meshes)==item['mesh_objects'], (item['slug'],len(meshes))
    assert tris==item['triangles'], (item['slug'],tris,item['triangles'])
    points=[ob.matrix_world @ Vector(corner) for ob in meshes for corner in ob.bound_box]
    bounds=[[round(min(p[i] for p in points),4),round(max(p[i] for p in points),4)] for i in range(3)]
    roots=[ob for ob in bpy.context.scene.objects if ob.parent is None]
    assert len(roots)==1 and roots[0].type=='EMPTY', (item['slug'],roots)
    assert roots[0].location.length < .00001
    results.append({'slug':item['slug'],'triangles':tris,'mesh_objects':len(meshes),'blender_xyz_bounds_m':bounds,'root':roots[0].name})
(out/'roundtrip.json').write_text(json.dumps(results,indent=2)+'\n')
print('ROUNDTRIP',json.dumps(results))
