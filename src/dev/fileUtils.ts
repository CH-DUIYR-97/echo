// /src/dev/fileUtils.ts

/** Create a real File from a Blob/bytes with a name and type. */
export function makeFile(
  data: Blob | ArrayBuffer | ArrayBufferView,
  name: string,
  type?: string
): File {
  let blob: Blob;

  if (data instanceof Blob) {
    blob = data;
  } else if (data instanceof ArrayBuffer) {
    blob = new Blob([data], type ? { type } : {});
  } else if (ArrayBuffer.isView(data)) {
    blob = new Blob([data.buffer], type ? { type } : {});
  } else {
    blob = new Blob([data as any], type ? { type } : {});
  }

  return new File([blob], name, {
    type: type || blob.type || 'application/octet-stream',
    lastModified: Date.now(),
  });
}

/** Create a fake File of ~sizeMB for tests (randomized first 64KB for realism). */
export function makeFakeFile(
  sizeMB: number,
  name = 'fake.bin',
  type = 'application/octet-stream'
): File {
  const size = Math.max(1, Math.round(sizeMB * 1024 * 1024));
  const u8 = new Uint8Array(size);
  const head = Math.min(size, 64 * 1024);
  if (head > 0) crypto.getRandomValues(u8.subarray(0, head));
  return new File([u8], name, { type, lastModified: Date.now() });
}

