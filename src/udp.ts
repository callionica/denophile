// deno-lint-ignore-file
import {
    AsyncPromise, AsyncPromiseCancelable, PromiseCancelable,
    raceAgainstTime,
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

    /** Triggers shutdown which is not cancelable. `cancel` is a no-op. */
    _shutdown: AsyncPromiseCancelable<Shutdown>;

    constructor(port: number = 35353) {
        this._connection = Deno.listenDatagram({
            port,
            hostname: "0.0.0.0",
            transport: "udp" as const,
        });
        this._shutdown = new AsyncPromiseCancelable();
    }

    // deno-lint-ignore no-inferrable-types
    send(buffer: Uint8Array, server: Server, timeout: number = 1000)
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

    receiveLoop(): Promise<Shutdown> {
        while (!this._shutdown.isResolved) {
            const result = this.receive();
        }
        return this._shutdown;
    }

    shutdown(): Promise<Shutdown> {
        this._shutdown.resolve();
        this._connection.close();
        return this._shutdown;
    }
}