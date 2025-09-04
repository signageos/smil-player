// Shim file to provide SyncEngine enum without class properties syntax
export var SyncEngine;
(function (SyncEngine) {
    /** Use external sync server. Device will connect to the server via websocket. */
    SyncEngine["SyncServer"] = "sync-server";
    /** Synchronize directly with other devices in the local network via UDP and TCP. */
    SyncEngine["P2PLocal"] = "p2p-local";
    /**
     * Synchronize directly with other devices in the local network via UDP.
     * @deprecated use P2PLocal
     */
    SyncEngine["Udp"] = "udp";
})(SyncEngine || (SyncEngine = {}));

// Export an empty default to satisfy imports
export default {};