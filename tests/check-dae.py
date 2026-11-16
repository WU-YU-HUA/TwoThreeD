"""Independent XML/ZIP read-back; does not import the JavaScript exporter."""
from pathlib import Path
import json, math, zipfile, xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
NS={'c':'http://www.collada.org/2005/11/COLLADASchema'}
def cross(a,b): return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def area3(vertices,indices):
    n=[0.,0.,0.]
    for i,j in zip(indices,indices[1:]+indices[:1]):
        v=cross(vertices[i],vertices[j]);n=[x+y for x,y in zip(n,v)]
    return math.sqrt(sum(x*x for x in n))/2
def check(folder,source):
    source=json.loads(source.read_text());dae=folder/'model.dae';tree=ET.parse(dae);root=tree.getroot()
    assert root.attrib['version']=='1.4.1'
    factor=float(root.find('c:asset/c:unit',NS).attrib['meter'])*1000
    assert factor==1 and root.find('c:asset/c:up_axis',NS).text=='Z_UP'
    ids={}
    for el in root.iter():
        if 'id' in el.attrib: assert el.attrib['id'] not in ids;ids[el.attrib['id']]=el
    for el in root.iter():
        for key in ['url','source','target']:
            ref=el.get(key,'')
            if ref.startswith('#'): assert ref[1:] in ids,ref
    nodes=root.findall('.//c:visual_scene//c:node',NS);assert len(nodes)==len(source['nodes'])
    by_source={n.find('c:extra/c:technique/c:source_node_id',NS).text:n for n in nodes}
    parents={child:parent for parent in root.iter() for child in parent}
    total=0;wall_points=[];wall_front_triangles=[]
    for original in source['nodes']:
        node=by_source[original['id']]
        assert node.find('c:extra/c:technique/c:original_name',NS).text==original.get('name',original['id'])
        assert json.loads(node.find('c:extra/c:technique/c:source_2d_ids',NS).text)==original['source_2d_ids']
        if original['parent_id'] is not None: assert parents[node] is by_source[original['parent_id']]
        assert not any(node.find('c:'+tag,NS) is not None for tag in ['matrix','translate','rotate','scale'])
        if not original['mesh']: assert node.find('c:instance_geometry',NS) is None;continue
        instance=node.find('c:instance_geometry',NS);mesh=ids[instance.attrib['url'][1:]].find('c:mesh',NS)
        position_ref=mesh.find('c:vertices/c:input',NS).attrib['source'][1:]
        position=[float(n)*factor for n in ids[position_ref].find('c:float_array',NS).text.split()]
        vertices=[position[i:i+3] for i in range(0,len(position),3)]
        assert vertices==original['mesh']['vertices_mm'],'Coordinates/scale changed'
        fixture_wall=folder.name=='fixture' and original['semantic'].get('category')=='wall_segment'
        if fixture_wall: wall_points.extend(vertices)
        expected_area=sum(area3(vertices,f['indices']) for f in original['mesh']['faces'])
        actual_area=0
        bindings={m.attrib['symbol']:m.attrib['target'][1:] for m in instance.findall('c:bind_material/c:technique_common/c:instance_material',NS)}
        for triangles in mesh.findall('c:triangles',NS):
            assert triangles.attrib['material'] in bindings
            inputs=triangles.findall('c:input',NS);stride=1+max(int(i.attrib['offset']) for i in inputs)
            numbers=[int(n) for n in triangles.find('c:p',NS).text.split()];count=int(triangles.attrib['count']);assert len(numbers)==count*3*stride
            vertex_offset=int(next(i for i in inputs if i.attrib['semantic']=='VERTEX').attrib['offset'])
            normal_input=next(i for i in inputs if i.attrib['semantic']=='NORMAL');normal_values=[float(v) for v in ids[normal_input.attrib['source'][1:]].find('c:float_array',NS).text.split()]
            for start in range(0,len(numbers),3*stride):
                tri=[numbers[start+j*stride+vertex_offset] for j in range(3)];assert all(0<=i<len(vertices) for i in tri)
                a,b,c=[vertices[i] for i in tri];normal=cross([b[i]-a[i] for i in range(3)],[c[i]-a[i] for i in range(3)])
                if fixture_wall and all(p[1]==-75 for p in [a,b,c]): wall_front_triangles.append([[p[0],p[2]] for p in [a,b,c]])
                ni=numbers[start+int(normal_input.attrib['offset'])]*3;n=normal_values[ni:ni+3];assert len(n)==3 and sum(x*y for x,y in zip(n,normal))>0
                actual_area+=area3(vertices,tri)
                for inp in inputs:
                    if inp.attrib['semantic']=='TEXCOORD':
                        uv=ids[inp.attrib['source'][1:]];values=[float(v) for v in uv.find('c:float_array',NS).text.split()]
                        for j in range(3):
                            index=numbers[start+j*stride+int(inp.attrib['offset'])];assert 0<=index<len(values)//2
            total+=count
        assert math.isclose(actual_area,expected_area,rel_tol=1e-8,abs_tol=.01),(original['id'],actual_area,expected_area)
    if folder.name=='fixture':
        bounds=[max(p[i] for p in wall_points)-min(p[i] for p in wall_points) for i in range(3)]
        assert bounds==[5000,150,2800],bounds
        def covered(point):
            for triangle in wall_front_triangles:
                signs=[(b[0]-a[0])*(point[1]-a[1])-(b[1]-a[1])*(point[0]-a[0]) for a,b in zip(triangle,triangle[1:]+triangle[:1])]
                if all(s>=-1e-8 for s in signs) or all(s<=1e-8 for s in signs): return True
            return False
        assert covered([500,1000]),'Solid wall is missing'
        assert not covered([1450,1050]),'900 mm door opening is covered'
        assert not covered([3500,1400]),'Window opening is covered'
        wall_x={p[0] for p in wall_points}
        assert 1000 in wall_x and 1900 in wall_x,'Door boundaries changed'
    for image in root.findall('c:library_images/c:image',NS):
        uri=image.find('c:init_from',NS).text;assert uri.startswith('textures/') and '..' not in uri;assert (folder/uri).read_bytes()[:8]==b'\x89PNG\r\n\x1a\n'
    archive=next(folder.glob('*.zip'))
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        assert z.read('model.dae')==dae.read_bytes()
        for item in z.infolist(): assert not Path(item.filename).is_absolute() and '..' not in Path(item.filename).parts
    print('PASS:',folder.name,len(nodes),'nodes;',total,'triangles; exact mm coordinates, hierarchy, area, normals, bindings and textures retained')
check(ROOT/'outputs/sketchup/actual',ROOT/'outputs/asset-preview/scene3d.json')
check(ROOT/'outputs/sketchup/fixture',ROOT/'outputs/sketchup/fixture/scene3d.json')
