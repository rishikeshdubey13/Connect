class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this.buffer = [];
      this.chunkSize = 2048; 
    }
  
    process(inputs) {
      const input = inputs[0][0];
      if (input) {
        this.buffer.push(...input);
        if (this.buffer.length >= this.chunkSize) {
          this.port.postMessage(new Float32Array(this.buffer));
          this.buffer = [];
        }
      }
      return true;
    }
  }
  
  registerProcessor('audio-processor', AudioProcessor);