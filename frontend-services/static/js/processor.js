// class AudioProcessor extends AudioWorkletProcessor {
//     constructor() {
//       super();
//       this.buffer = [];
//       this.chunkSize= 1600;
//     //   this.sampleRate = 16000; to explicitly set the sample rate
//     //   this.chunkSize = 2048; 
        
//     }
  
//     process(inputs) {
//       try {
//           const input = inputs[0][0];
//           if (input && input.length > 0) {
//               this.buffer.push(...input);
//               if (this.buffer.length >= this.chunkSize) {
//                   this.port.postMessage(new Float32Array(this.buffer));
//                   this.buffer = [];
//               }
//           }
//       } catch (error) {
//           console.error('Audio processing error:', error);
//       }
//       return true;
//   }
//   }
  
//   registerProcessor('audio-processor', AudioProcessor);
// processor.js
class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = [];
        this.bufferSize = 1600; // ~100ms at 16kHz
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input.length > 0) {
            // Use only the first (mono) channel
            const monoData = input[0];
            this.buffer.push(...monoData);
            while (this.buffer.length >= this.bufferSize) {
                const chunk = this.buffer.splice(0, this.bufferSize);
                this.port.postMessage(chunk);
            }
        }
        return true;
    }
}

registerProcessor('audio-processor', AudioProcessor);   