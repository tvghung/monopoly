'use strict';
/* eslint-disable no-undef, @typescript-eslint/no-require-imports */

const net = require('node:net');
const dgram = require('node:dgram');

const GUARD_SYMBOL = Symbol.for('own-the-block.test-network-listen-guard');
const ALLOWED_HOSTS = new Set(['127.0.0.1', '::1']);
const GUARD_ERROR_CODE = 'OTB_TEST_UNSAFE_NETWORK_LISTENER';

function assertLoopbackTestHost(host) {
  if (typeof host !== 'string' || !ALLOWED_HOSTS.has(host)) {
    const display = host === undefined ? 'an omitted host' : JSON.stringify(host);
    const error = new Error('Test network listener rejected ' + display + '; only 127.0.0.1 and ::1 are allowed.');
    error.code = GUARD_ERROR_CODE;
    throw error;
  }
}

function tcpHostFromArguments(args) {
  const first = args[0];
  if (first && typeof first === 'object' && !ArrayBuffer.isView(first)) {
    return first.host;
  }
  return typeof args[1] === 'string' ? args[1] : undefined;
}

function udpHostFromArguments(args) {
  const first = args[0];
  if (first && typeof first === 'object') return first.address;
  return typeof args[1] === 'string' ? args[1] : undefined;
}

function installSafeTestNetworkGuard() {
  if (globalThis[GUARD_SYMBOL]) return false;

  const originalListen = net.Server.prototype.listen;
  const originalBind = dgram.Socket.prototype.bind;

  Object.defineProperty(net.Server.prototype, 'listen', {
    ...Object.getOwnPropertyDescriptor(net.Server.prototype, 'listen'),
    value: function guardedListen(...args) {
      assertLoopbackTestHost(tcpHostFromArguments(args));
      return Reflect.apply(originalListen, this, args);
    },
  });

  Object.defineProperty(dgram.Socket.prototype, 'bind', {
    ...Object.getOwnPropertyDescriptor(dgram.Socket.prototype, 'bind'),
    value: function guardedBind(...args) {
      assertLoopbackTestHost(udpHostFromArguments(args));
      return Reflect.apply(originalBind, this, args);
    },
  });

  Object.defineProperty(globalThis, GUARD_SYMBOL, { value: true, configurable: false });
  return true;
}

if (process.env.OTB_TEST_NETWORK_GUARD === 'loopback-only') {
  installSafeTestNetworkGuard();
} else if (process.env.OTB_TEST_NETWORK_GUARD !== undefined) {
  throw new Error('Unsupported OTB_TEST_NETWORK_GUARD mode: ' + process.env.OTB_TEST_NETWORK_GUARD);
}

module.exports = { assertLoopbackTestHost, installSafeTestNetworkGuard };
