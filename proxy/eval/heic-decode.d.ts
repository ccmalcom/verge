declare module 'heic-decode' {
  type Decoded = { width: number; height: number; data: Uint8ClampedArray };
  function decode(opts: { buffer: Uint8Array | ArrayBufferLike }): Promise<Decoded>;
  export default decode;
}
