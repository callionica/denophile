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
    connection: Deno.DatagramConn;
    
    isShuttingDown_: boolean;
    shutdown_: AsyncPromise<Shutdown>;

    constructor(port: number = 35353) {
        this.connection = Deno.listenDatagram({
            port,
            hostname: "0.0.0.0",
            transport: "udp" as const,
        });
        this.isShuttingDown_ = false;
        this.shutdown_ = new AsyncPromise();
    }

    send(buffer: Uint8Array, server: Server, timeout: number)
        : PromiseCancelable<Shutdown | TimeoutExpired | TimeoutCanceled | number> {
        if (this.isShuttingDown_) {
            return AsyncPromiseCancelable.resolve(new Shutdown());
        }

        const promise = this.connection.send(buffer, { port: server.port, hostname: server.host, transport: "udp" });
        return raceAgainstTime([promise, this.shutdown_], timeout);
    }

    receive(timeout: number)
        : PromiseCancelable<Shutdown | TimeoutExpired | TimeoutCanceled | [Uint8Array, Server]> {
        if (this.isShuttingDown_) {
            return AsyncPromiseCancelable.resolve(new Shutdown());
        }

        const original = this.connection.receive();
        const promise = original.then(([buffer, addr]) => {
            return [buffer, new Server((addr as Deno.NetAddr).hostname, (addr as Deno.NetAddr).port)] as const;
        });
        return raceAgainstTime([promise, this.shutdown_], timeout);
    }

    shutdown() {
        this.isShuttingDown_ = true;
        this.shutdown_.resolve();
    }
}