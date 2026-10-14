// -----------------------------------------------------------------------------
// One TCP connection to a Solarman logger, one request at a time.
//
// The LSW-3 loggers serve few clients at once and mix answers up when two
// requests overlap: requests go through a queue, and the connection is kept
// open between cycles (opened again on the next request after an error). A
// request that gets no answer closes the socket: a late answer would
// otherwise be taken for the next one (the sequence byte guards it too).
// -----------------------------------------------------------------------------

import net from 'node:net';
import {
  CONTROL,
  V5Error,
  decodeResponse,
  encodeRequest,
  encodeTimeResponse,
  parseReadResponse,
  readRequest,
  splitFrames,
} from './frame.js';

export const DEFAULT_PORT = 8899;
const UNSOLICITED = new Set([
  CONTROL.HANDSHAKE,
  CONTROL.DATA,
  CONTROL.INFO,
  CONTROL.HEARTBEAT,
  CONTROL.REPORT,
]);

export class SolarmanClient {
  /**
   * @param {object} options
   * @param {string} options.host logger IP address
   * @param {number} options.serial logger serial number
   * @param {number} [options.port]
   * @param {number} [options.slaveId] Modbus address of the inverter
   * @param {number} [options.timeoutMs] per request
   */
  constructor({ host, serial, port = DEFAULT_PORT, slaveId = 1, timeoutMs = 10_000 }) {
    this.host = host;
    this.serial = serial;
    this.port = port;
    this.slaveId = slaveId;
    this.timeoutMs = timeoutMs;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pending = null;
    this.queue = Promise.resolve();
    this.sequence = Math.floor(Math.random() * 254) + 1;
    this.closed = false;
  }

  /**
   * Reads `count` registers from `start`.
   * @param {number} functionCode 3 (holding) or 4 (input)
   * @returns {Promise<number[]>}
   */
  readRegisters(functionCode, start, count) {
    const run = () => this.#request(functionCode, start, count);
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }

  /** Closes the connection; the next request opens a new one unless `close()` was final. */
  close() {
    this.closed = true;
    this.#drop(new V5Error('Connection closed', 'closed'));
  }

  async #request(functionCode, start, count) {
    if (this.closed) {
      throw new V5Error('Connection closed', 'closed');
    }
    const socket = await this.#connect();
    this.sequence = (this.sequence + 1) & 0xff;
    const sequence = this.sequence;
    const frame = encodeRequest(
      this.serial,
      sequence,
      readRequest(this.slaveId, functionCode, start, count),
    );
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        // No answer: the logger (or the inverter behind it) is busy or asleep,
        // or the serial number is wrong (the logger then stays silent).
        this.#drop(new V5Error('No answer from the logger', 'timeout'));
        reject(new V5Error('No answer from the logger', 'timeout'));
      }, this.timeoutMs);
      this.pending = {
        sequence,
        settle: (error, frameIn) => {
          clearTimeout(timer);
          this.pending = null;
          if (error) {
            reject(error);
            return;
          }
          try {
            const rtu = decodeResponse(frameIn, { serial: this.serial, sequence });
            resolve(parseReadResponse(rtu, { slaveId: this.slaveId, functionCode, count }));
          } catch (err) {
            reject(err);
          }
        },
      };
      socket.write(frame);
    });
  }

  #connect() {
    if (this.socket) {
      return Promise.resolve(this.socket);
    }
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      socket.setNoDelay(true);
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new V5Error('Connection to the logger timed out', 'connect'));
      }, this.timeoutMs);
      socket.once('connect', () => {
        clearTimeout(timer);
        socket.setKeepAlive(true, 30_000);
        this.socket = socket;
        this.buffer = Buffer.alloc(0);
        resolve(socket);
      });
      socket.on('data', (chunk) => this.#onData(socket, chunk));
      socket.on('error', (err) => {
        clearTimeout(timer);
        if (this.socket === socket) {
          this.#drop(new V5Error(`Connection lost: ${err.code ?? err.message}`, 'closed'));
        } else {
          reject(
            new V5Error(`Cannot connect to the logger: ${err.code ?? err.message}`, 'connect'),
          );
        }
      });
      socket.on('close', () => {
        if (this.socket === socket) {
          this.#drop(new V5Error('Connection closed by the logger', 'closed'));
        }
      });
    });
  }

  #onData(socket, chunk) {
    const { frames, rest } = splitFrames(Buffer.concat([this.buffer, chunk]));
    this.buffer = rest;
    for (const frame of frames) {
      const control = frame[4];
      if (UNSOLICITED.has(control)) {
        socket.write(encodeTimeResponse(frame));
        continue;
      }
      // A late answer to a request that timed out carries another sequence: skipped.
      if (this.pending && control === CONTROL.RESPONSE && frame[5] === this.pending.sequence) {
        this.pending.settle(null, frame);
      }
    }
  }

  #drop(error) {
    const socket = this.socket;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    if (socket) {
      socket.destroy();
    }
    if (this.pending) {
      this.pending.settle(error);
    }
  }
}
