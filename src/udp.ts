// deno-lint-ignore-file
import {
    AsyncPromise, AsyncPromiseCancelable, PromiseCancelable,
    raceAgainstTime,
    Timeout,
    TimeoutCanceled, TimeoutExpired
} from "./promise.ts"

export class Server {
    host: string;
    port: number;

    constructor(host: string, port: number) {
        this.host = host;
        this.port = port;
    }
}

export class Shutdown { }

export class UDP {
    _connection: Deno.DatagramConn;

    /** The promise that is resolved when the receive loop is finished */
    _loop: Promise<Shutdown>;

    /** Triggers shutdown which is not cancelable. `cancel` is a no-op. */
    _shutdown: AsyncPromiseCancelable<Shutdown>;

    constructor(port: number = 35353) {
        this._connection = Deno.listenDatagram({
            port,
            hostname: "0.0.0.0",
            transport: "udp" as const,
        });
        this._shutdown = new AsyncPromiseCancelable();
        this._loop = this._receiveLoop();
    }

    // deno-lint-ignore no-inferrable-types
    send(buffer: Uint8Array, server: Server, timeout: number = Infinity)
        : PromiseCancelable<Shutdown | TimeoutExpired | TimeoutCanceled | number> {
        if (this._shutdown.isResolved) {
            return this._shutdown;
        }

        const promise = this._connection.send(buffer, { port: server.port, hostname: server.host, transport: "udp" });
        return raceAgainstTime([promise, this._shutdown], timeout);
    }

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

    async _receiveLoop(): Promise<Shutdown> {
        while (!this._shutdown.isResolved) {
            const result = await this.receive();

            if (result instanceof Shutdown) {
                break;
            }

            if (result instanceof Timeout) {
                continue;
            }

            console.log(result);
            await this.onreceive(result[0], result[1]);
        }
        return this._shutdown;
    }

    async onreceive(buffer: Uint8Array, server: Server): Promise<void> {
    }

    async shutdown(): Promise<Shutdown> {
        this._shutdown.resolve(new Shutdown());
        await this._loop;
        this._connection.close();
        return this._shutdown;
    }
}