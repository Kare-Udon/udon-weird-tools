import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseVrcPhotoMetadata } from './run.ts';

test('parses VRC Author and custom XMP fields from an uncompressed PNG iTXt chunk', async () => {
  const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
    <rdf:Description>
      <xmp:Author>KareUdon</xmp:Author>
    </rdf:Description>
    <rdf:Description xmlns:vrc="http://ns.vrchat.com/vrc/1.0/">
      <vrc:WorldID>wrld_7cb5ff54-8d57-4cef-a9e3-0a51fda1a39a</vrc:WorldID>
      <vrc:WorldDisplayName>SkipFloor</vrc:WorldDisplayName>
      <vrc:AuthorID>usr_fe0b910a-9af6-4155-b6b5-5a70bebc49f1</vrc:AuthorID>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>`;

  const file = new File([createPngWithXmp(xmp)], 'VRChat_2026-05-02_22-35-42.467_3840x2160.png', {
    type: 'image/png',
  });

  const result = await parseVrcPhotoMetadata(file, 'en');

  assert.deepEqual(result, {
    username: 'KareUdon',
    worldId: 'wrld_7cb5ff54-8d57-4cef-a9e3-0a51fda1a39a',
    worldDisplayName: 'SkipFloor',
    authorId: 'usr_fe0b910a-9af6-4155-b6b5-5a70bebc49f1',
  });
});

function createPngWithXmp(xmp) {
  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = createChunk('IHDR', Uint8Array.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]));
  const keyword = new TextEncoder().encode('XML:com.adobe.xmp');
  const text = new TextEncoder().encode(xmp);
  const data = new Uint8Array(keyword.byteLength + 5 + text.byteLength);

  data.set(keyword, 0);
  data[keyword.byteLength] = 0;
  data[keyword.byteLength + 1] = 0;
  data[keyword.byteLength + 2] = 0;
  data[keyword.byteLength + 3] = 0;
  data[keyword.byteLength + 4] = 0;
  data.set(text, keyword.byteLength + 5);

  const itxt = createChunk('iTXt', data);
  const iend = createChunk('IEND', new Uint8Array());
  return new Blob([signature, ihdr, itxt, iend]);
}

function createChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.byteLength);
  const view = new DataView(chunk.buffer);

  view.setUint32(0, data.byteLength, false);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.byteLength, 0, false);

  return chunk;
}
