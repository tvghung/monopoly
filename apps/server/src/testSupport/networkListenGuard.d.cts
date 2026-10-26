declare const networkListenGuard: {
  assertLoopbackTestHost(host: unknown): asserts host is '127.0.0.1' | '::1';
  installSafeTestNetworkGuard(): boolean;
};

export = networkListenGuard;
