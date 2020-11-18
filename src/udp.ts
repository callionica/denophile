// deno-lint-ignore-file
import {
    AsyncPromise, AsyncPromiseCancelable, PromiseCancelable,
    raceAgainstTime,
    Timeout,
    TimeoutCanceled, TimeoutExpired
} from "./promise.ts"

/** Represents the address of a device on the network */
export class Server {
    /** The IP address or hostname of a device */
    host: string;

    /** The port number of a device */
    port: number;

    constructor(host: string, port: number) {
        this.host = host;
        this.port = port;
    }
}

/**
 * Represents a shutdown signal.
 * If you see Shutdown as one of the return types in a
 * Promise-returning function, you'll know that function
 * recognizes the shutdown signal and stops processing safely
 * at the appropriate time.
 */
export class Shutdown { }

/**
 * A class for receiving data at a UDP socket and sending data to UDP sockets on the network.
 * 
 * Pass a port number to the constructor to be used to receive incoming messages.
 * 
 * To send data, call `send` as many times as necessary.
 * 
 * To receive data, call `listen` once to start a loop to receive messages and transfer them to `onReceive`, the message handler that you pass in to the `listen` function.
 * 
 * Call `shutdown` to safely close the UDP socket.
 * 
 * If you want lower level handling of incoming messages, you can skip the call to
 * `listen` and call `receive` yourself as many times as necessary.
 */
export class UDP {
    /** Deno's representation of a UDP socket */
    _connection: Deno.DatagramConn;

    /** The promise that is resolved when the receive loop is finished */
    _loop?: Promise<Shutdown>;

    /**
     * Triggers shutdown when resolved.
     * Shutdown is not cancelable; `cancel` is a no-op,
     * but it's convenient to represent as a cancelable operation
     * to fit in with the overall API.
     */
    _shutdown: AsyncPromiseCancelable<Shutdown>;

    /**
     * @param port The port used for receiving data from the network 
     */
    constructor(port: number = 35353) {
        this._connection = Deno.listenDatagram({
            port,
            hostname: "0.0.0.0",
            transport: "udp" as const,
        });
        this._shutdown = new AsyncPromiseCancelable();
    }

    /**
     * Sends data through the network to the host/port specified.
     * 
     * @param buffer The data to send.
     * @param server The device to send the data to.
     * @param timeout The maximum number of milliseconds to wait before returning.
     * 
     * timeout defaults to `Infinity` meaning the promise won't be resolved until the send has
     * completed, the UDP object is told to shutdown, or the operation is canceled manually.
     */
    send(buffer: Uint8Array, server: Server, timeout: number = Infinity)
        : PromiseCancelable<Shutdown | TimeoutExpired | TimeoutCanceled | number> {
        if (this._shutdown.isResolved) {
            return this._shutdown;
        }

        const promise = this._connection.send(buffer, { port: server.port, hostname: server.host, transport: "udp" });
        return raceAgainstTime([promise, this._shutdown], timeout);
    }

    /**
     * Receives data from the network that has been sent to the port used to construct
     * the UDP object.
     * 
     * @param timeout The maximum number of milliseconds to wait before returning.
     * 
     * timeout defaults to `Infinity` meaning the promise won't be resolved until a message is
     * received, the UDP object is told to shutdown, or the operation is canceled manually.
     */
    receive(timeout: number = Infinity)
        : PromiseCancelable<Shutdown | TimeoutExpired | TimeoutCanceled | [Uint8Array, Server]> {
        if (this._shutdown.isResolved) {
            return this._shutdown;
        }

        const original = this._connection.receive();
        const promise = original.then(([buffer, addr]) => {
            return [buffer, new Server((addr as Deno.NetAddr).hostname, (addr as Deno.NetAddr).port)] as const;
        });
        return raceAgainstTime([promise, this._shutdown], timeout);
    }

    /**
     * This is where messages are received from the network and passed to `onReceive`
     * if `listen` has been called. Handles shutdown and timeouts.
     */
    async _receiveLoop(onReceive: (buffer: Uint8Array, server: Server) => Promise<void>): Promise<Shutdown> {
        while (!this._shutdown.isResolved) {
            const result = await this.receive();

            if (result instanceof Shutdown) {
                break;
            }

            if (result instanceof Timeout) {
                continue;
            }

            await onReceive(result[0], result[1]);
        }
        return this._shutdown;
    }

    /**
     * Starts a loop to receive messages from the network and pass them to `onReceive`.
     * Only needs to be called once; subsequent calls are no-ops.
     * 
     * @param onReceive Receives data from the network
     */
    listen(onReceive: (buffer: Uint8Array, server: Server) => Promise<void>) {
        if (this._loop) {
            // If the loop has already been started, just return.
            return;
        }
        this._loop = this._receiveLoop(onReceive);
    }

    /** Shuts down the UDP socket safely */
    async shutdown(): Promise<Shutdown> {
        this._shutdown.resolve(new Shutdown());
        await this._loop;
        this._connection.close();
        return this._shutdown;
    }
}