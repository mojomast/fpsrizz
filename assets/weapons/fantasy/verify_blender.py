"""Round-trip all GLBs through Blender's importer; run with blender -b --python."""
import bpy, json
from pathlib import Path
from mathutils import Vector

out=Path(__file__).resolve().parent
stats=json.loads((out/'stats.json').read_text())
result={}
for slug, item in stats.items():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(out/(slug+'.glb')))
    bpy.context.view_layer.update()
    root=bpy.data.objects.get(slug+'_GRIP_ROOT')
    assert root and root.location.length<1e-6, slug
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    assert len(meshes)==item['objects'], (slug,len(meshes),item['objects'])
    for o in meshes: o.data.calc_loop_triangles()
    triangles=sum(len(o.data.loop_triangles) for o in meshes)
    assert triangles==item['triangles'], (slug,triangles,item['triangles'])
    vertices=[o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
    bounds=[[round(min(v[i] for v in vertices),4),round(max(v[i] for v in vertices),4)] for i in range(3)]
    assert bounds[1][1] > 0.4 and bounds[2][1]>0, (slug,bounds)
    result[slug]={'imported_meshes':len(meshes),'triangles':triangles,'blender_xyz_bounds_m':bounds}
(out/'roundtrip.json').write_text(json.dumps(result,indent=2)+'\n')
print('ROUNDTRIP_OK',json.dumps(result))
