class RiftMicrophone extends AudioWorkletProcessor {
  constructor() { super(); this.packet = new Float32Array(2048); this.count = 0; }
  process(inputs) {
    const mono = inputs[0]?.[0];
    if (mono) for (const sample of mono) {
      this.packet[this.count++] = sample;
      if (this.count === this.packet.length) {
        this.port.postMessage(this.packet, [this.packet.buffer]);
        this.packet = new Float32Array(2048); this.count = 0;
      }
    }
    return true;
  }
}
registerProcessor('rift-microphone', RiftMicrophone);