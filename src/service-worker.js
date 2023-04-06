importScripts('node_modules/workbox-sw/build/workbox-sw.js');

workbox.routing.setDefaultHandler(new workbox.strategies.NetworkFirst());
