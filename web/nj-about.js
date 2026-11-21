/*
 * Nijika UI: System > About. What the firmware is made of (the image, the
 * source revisions it was built from, the kernel and the partition it runs
 * from), the credits, and the notices.
 *
 * The revisions come from the build manifest, /etc/odi-build, which confd
 * hands over as /api/firmware `build`: the Nijika Luna build writes the
 * odi-oss and odi-ui releases and commits there (rtl9601-nijika-luna
 * build.sh, BUILD_INFO). An image built without them shows a dash.
 *
 * The mascot is Nijika holding an ONU box, line art drawn in the text
 * colour, so it follows the light and the dark theme.
 */

import { el } from './dom.js';
import { S } from './state.js';

const DASH = '—';

const REPO = {
  oss: 'https://github.com/AndreZiviani/odi-oss',
  ui: 'https://github.com/AndreZiviani/odi-ui',
  nijikaUi: 'https://github.com/PururinCollective/rtl9601-nijika-ui',
};

const MASCOT = '<svg class="nj-mascot-svg" role="img" aria-label="Nijika holding an ONU box" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M502.3 512.4q-.4-5-1-10c-.2-4.1-1-8.3-1.3-12.5l-.8-10.6-.9-11-.3-5.9q-.6-6.6-.8-13.3l-1-19.4-.3-10.2q-.6-12.1-.6-24.4-.6-27-.3-54l.1-16q0-11.2.4-22.5l.7-19.3q.3-8.5.7-17c.5-7.8.5-15.7 1-23.5q.9-10.5 1.2-21.2l1-17.2q.1-4.8.2-9.4c.7-8.5.6-17 .9-25.4l.5-16.9q.5-12 .8-23.8.2-12.4-.1-24.7-.1-5.7-.7-11.3-.6-9-2.1-18.1-1.4-7.5-3.6-15a71 71 0 0 0-6.5-16.1c-3-5.2-6.3-10.2-11.8-13.3-3.3-2-6.8-2.3-10.4-2-10 .6-18 5.8-25.6 11.8q-7.8 6.3-14.4 13.7-2.5 3.2-5.4 6-1 .9-1.7 0l-2.1-3a10 10 0 0 0-2.7-2.8q-2-1.5-4.5-.4c-2.9 1.4-5.5 3.3-8.3 4.8q-1.9 1-3.5-.4-3.7-3.5-7.8-6.6-9.3-7.1-19.5-12.8l-9.2-5c-6.7-3.5-13.8-5.6-21-7.6q-7.6-2.1-15.4-3.4c-7.7-1.2-15.4-2.7-23.3-3a458 458 0 0 0-21.9-.4q-7.1 0-14.2.6c-4.3.3-8.5 1.2-12.8 1.8a166 166 0 0 0-47 14.6q-5.3 2.8-10.9 5.5a174.6 174.6 0 0 0-61.4 53c-6 8-10.8 16.8-16.2 25.4-1 1.5-1 3.1-1.5 4.7q-1.3 3-2.8 6-4.7 11.9-7.1 24.2-2.5 12.3-3.4 24.7c-.5 6.6-1 13.1-.7 19.7q.3 10.3 1.4 20.7 2.8 22 12.6 41.9a16 16 0 0 0 2.4 3.5c.8 1 1 2.4 1.4 3.6"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M440.4 244.4c-.2 6.5.2 13 .4 19.6q.3 13.5 1.2 26.8l.7 12.2q.5 8.2 1.3 16.5c.4 4.4 1 8.8.8 13.2-.3 4.3 1.2 8.3 1.4 12.5q.2 5.7 1 11.3.3 4.6 1 9.2l1 10.3 1.8 15.5 1.6 11.8q.5 4.6 1.2 9.2c.8 5.3 1.3 10.6 2.3 15.9q.7 4 1.1 8.1l1.4 8.2 2.1 12.5 2 11.7q1.3 6.1 2.2 12.3t2.5 12.5l3.4 16 .7 2.7M294 430c-2-1.3-2.9-3.3-4.2-5-2.2-2.8-5.2-4.4-8-6.2-1.2-.7-2.7-.3-4-.3q-5.6.2-11 .5t-11 .8l-7 .5c-1.8.1-3.6-.3-5.5.3-1.7.5-3.6.3-5.4.5q-2.4.3-4.9.2c-3 .2-6 0-9 .9q-2.5.4-5 .3l-6.3.5-13.4 1-10 .5-15.6 1.2q-6.5.5-13 .7l-16.5.8q-2.6.1-5 .5-1.5 0-2.5 1.1-6.6 7.1-7.9 17c-.7 5.5-.2 11 0 16.6v.5l.3 15.9c.2 11.2.8 22.3.8 33.5M454.4 498.6q1.4 0 2.1-1.2 3.2-4.8 3.8-10.4.1-1.7 0-3.5c-.3-6.3-2.4-12.3-4.2-18.3-2.5-8.5-5.8-17-8.2-25.6-2.5-8.7-4.8-17.6-7.8-26.2-2.4-7-4.2-14-7-20.8-2.7-6.5-4.3-13.3-7.9-19.4q-3-5.3-7.5-9.4a102 102 0 0 0-28.7-17q-4.5-1.6-9-3.1-2.3-1-2.6 1.7l-.9 7.5-1.4 14q-.7 6.9-1.8 13.6c-.4 2.6-.6 5.2-1.6 7.7q-.7 2-2.8 2.6c-1.5-1.6-1.6-3.8-2-5.8q-2.5-9.7-5.2-19.3c-.3-1.3-.2-2.9-1.5-3.7-1.4 1-1.9 2.5-2.6 4q-3.5 6.3-8 12.2.4 1 1.5 1.3 5.1 2.4 9.6 5.8c3.6 2.9 4.2 6.7 3.7 10.7a44 44 0 0 1-6.1 16.2q-.8 1.5-1.8 2.7-1.1 1.4 0 2.9 3.3 4.5 2.4 10a28 28 0 0 1-4 10.3c-2.7 4.4-2 3.5 1.5 5.5 2.5 1.6 5.4 2.6 7.8 4.4 4 3.2 6.8 7.1 7 12.7.3 6.9.2 13.8.8 20.7 0 .7-.5 1.1-.3 1.7M147.5 252.5c-.9 1-.8 2.2-.7 3.3q.4 5.1.1 10.1l-1 16.9c-.4 4-.3 7.9-.7 11.8s-.1 8-.4 12c-.8 13.1-.4 26.2-.4 39.3q0 7 .8 14.1c.5 4.8 1.6 9.4 2.4 14.1q2 11 4.8 22c1 4.3 3.4 8.1 5.7 12q.5.6 1.2.8M326 173.8q.5 7.2.7 14.6c0 3.7.8 7.3.9 11 0 4.9.6 9.7.8 14.5q.6 9 1 18.1v14.4q.7 20.5.3 41 0 14.8-.4 29.7l-.6 23.4q0 2-1.9 3a162 162 0 0 1-18 11.2c-3.5 1.9-4.7 5-5.2 8.6-.3 2-.2 4-1.4 6-.6 1 .2 2.2.7 3.2"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M359.8 104.4q.7.2.7 1c1 6.8 3.3 13.3 4.5 20l2.5 12.5q1.2 5.5 2 11 1.8 10.5 3.2 21 .9 5.5 1.6 11.2 1 7.7 1.7 15.4.7 6 1 11.9.5 4.9.7 9.9-.1.8.2 1.5c1 1.2.7 2.6.7 4q.2 10.7.9 21.4.2 4.8.3 9.7c.3 9.7.3 19.4.9 29 .1 2.5-.7 4.6-.6 6.9v4.5q-.5 15.5-1.4 31l-.5 7c-.3 2.2 0 4.3-.6 6.4q-.4 1.9.7 3.8M216 126.4c-1.3 1.3-1.5 3-1.9 4.6q-2.5 9.5-4.4 19-1.9 9.2-3.2 18.3l-1.8 15.2q-.4 4.4-.5 8.7c-.2 4.5-.6 9-.4 13.5q.3 8 1 16c.3 4.7 1.2 9.3 1.6 14q.1 1.2-.5 2.2M172.7 44.2c-3 .3-5-2-7.4-3q-15-7.2-29-16.3-15.4-9.8-30.5-20.2-1-.7-2-1c-1.3.8-.9 2.1-.8 3.3l.9 11.3q.5 5.6 1.7 11c1.1 5.7 2.5 11.2 5.2 16.3q1.4 2.5 3.1 4.8 1 1.4 2.6 1.3c4.9-.3 9.7.6 14.5.3 6.3-.4 12.8-.3 19.1-1.5 5.8-1 11.6-2 17-4.2q2-.6 3.2-2.1M302 369.4c-1.9-1.2-2.3-3.2-3-5-.7-1.5-1-3.2-2-4.4-1.9-2-2-4.4-2.3-7q-.8-6.9-4.4-13.1c-2-3.3-4.8-3.4-7.7-3.7-4.2-.3-8.4.3-12.5.8h-1.8c-4.3 0-8.7.3-13 .1q-10.1-.1-20.2-.4a91 91 0 0 1-17-2.8q-8.9-2.4-17.8-4.9-3-.9-6-2.2-1.5-.7-3-.6M419.7 74.4q-.3 7.5-2.3 14.8-.7 2.7-1 5.6-.4 1.8 1.7 1.8c1.1-.2 2.3-.5 3.5 0 2.5 1.2 3.4 3.6 4 5.9a95 95 0 0 1 3 16q.7 9.4.4 19v15l.2 7.7v26.6q.3 14.6.4 29.2l.2 19.2c-.2 1.6-.5 3.3 0 5 .6 1.2.4 2.5.5 3.8q.2 11.7.9 23.3a337 337 0 0 0 3 30.3c1.6 9.2 3 18.4 5.6 27.4l3 9.3q.3 1.1 1.6 1.5M214 115.1l2.3 9.1c1 3.4 2.6 6.3 3.6 9.6q1.7 4.9 4.1 9.5 1.5 3 2.6 6.1c1.5 3.6 3.8 6.7 5.6 10q8 14.9 19 27.4 10.8 12.6 25 21.6 3.8 2.5 7.8 4.8 1.5 1 3.1.5M183 153.8c-2.1 1-2.8 3.1-3.7 5a163 163 0 0 0-14.7 51.5c-.7 7.6-.4 15.4-.4 23.1 0 3.5.1 7 1.2 10.3q.5 1.5 0 3c-.5 1.2 0 2.5.2 3.7 1 5.8 2 11.5 3.8 17.1q.7 1.5 1.3 3.3c0 .4.5 1.1 1.3 1M318.8 208.4c-.3-1.3-.8-2.2-2.3-1.8q-.6.1-1-.3a86 86 0 0 1-13.2-9.4Q294 190 287 182a251 251 0 0 1-28-38.5c-2.6-4.4-5.4-8.9-7.5-13.7-.4-1-1-2.2-2.2-2.6"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M247 120q.8 3.3 2 6.5.3.4 0 1.2-.7 2.3.2 4.5c3 8 5.1 16.3 8 24.3 6 16.6 12.9 32.8 23 47.4q2.8 3.8 5.8 7.4c.8 1 1 2.4 2.2 3.2q.4.4 1 .5M186.6 132.5c-1 3-.9 6-1.4 9-.7 3.8-.5 7.7-2 11.4v1.2c1 3.2.2 6.4 0 9.6q-.2 2.9-.2 5.7c-.1 6.4.6 12.7 1.1 19q1.2 12.5 5.3 24.3 4.4 13.5 14.3 23.7.4.8 1.5 1.2c1 .3 1.2 1.3 1.6 2M124.2 181.2c-1.6 1.2-1.9 3-2 4.7l-1.4 11.5c-1 8.8-1.2 17.6-1.6 26.4q-.3 10.3.2 20.5.3 4.9.4 9.8c0 2.6.5 5.2.7 7.8 0 1 .4 2.2-.5 3.2M304.9 420.4c-.6.7-1.5.7-2.3 1a19 19 0 0 0-8.3 8.2c-.7 1.2-.4 2.9-.4 4.3q.4 7.5.6 15.2-.1 4.8.4 9.5c.6 7.4.5 14.8 1 22.1.6 8.3.5 16.7 1.3 25q.2 3.4.2 6.7M387.5 423.1q.4 6.9 1.2 13.8 1.1 7 2.4 14l1.5 10.5a221 221 0 0 0 9.7 38.3c-.4 2.5 1.4 3.6 3.1 4.7q2.5 1.6 5.7 1.5l9-.7q5.7-.6 11.2-1c2.5 0 5.1-.3 7.3 1.4M166 245.6q1 .3 1.5 1.5c2.3 4.8 3.2 10 4.1 15.2q.7 3 1 6c.3 1.4-.4 2.7-.4 4 .1 1.4 1.5 2.3 1.5 3.7q.3 6.4 1.1 12.7.5 5.3 1.3 10.6l1.6 8.9c1.3 6.4 5 11.1 10.2 15 2.2 1.6 3.5 3 2.7 6.2-.7 2.6-.3 5.6-.5 8.4l-1 13.9q-.4 8 0 16.1l.2 9.8c0 4.4.5 8.8.5 13.2l.3 8.5q-.2 2.6-.5 5M381.2 285.8c2-.7 3-2.5 4.2-3.9q5-5.6 9-12a49 49 0 0 0 6.7-16.8c.9-4.3.6-8.6.2-13-.3-3.6-.9-7-2.8-10.2a18 18 0 0 0-9.6-8.2c-3.2-1-6.6-2-10-.5M117 122.4c-1.8 0-2.4 1.6-3.2 2.7q-13.1 16.8-28 32.3c-7.9 8-16 15.7-25.1 22.3a49 49 0 0 1-11.5 6.4q-1.2.3-2.4.7M276 359.3q-1.5-.2-2.6.7c-5.7 4.2-12 7.4-18 11.1q-7.3 4.7-11.2 12.4-6.8 14-12.4 28.3-1.5 3.8-3.5 7.3-.5 1-.6 2"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M127.7 148.5q-.7 5.8-1.3 11.7c-.7 5.8-.9 11.6-2 17.4-.3 1.5-.6 3.4.6 4.9.4.4.2 1 .2 1.5q.7 7.2 1.3 14.4 1 8.2 2.9 16a87 87 0 0 0 13.7 31c1.6 2.2 3.5 4.2 4.7 6.7.4 1 1.9 1.4 2.8 2.1q1 1 2.3 1.5M429.2 238.3q-1.3.5-1.7 1.9-8.2 16.4-19.9 30.6a100 100 0 0 1-20.3 19q-3.1 2.2-6.8 3.4M326 375.1q.5 1 .4 2-.1 5.4-.7 11c-.3 4.4-.9 9-.7 13.5l.2.8q.8 2.8 2.8 1 2.6-2.4 4.2-5.5c3-5 5-10.4 7.8-15.5l2.6-4.8q1-2.7 1.9-5.3 5.2-12.3 8.8-25.2c.3-1.2.3-2.8 1.9-3.6 1.3 1.5 1.5 3.3 1.9 5q1.4 5.5 3 11 .3 1.1.2 2.2M272.4 377.8c-.9 1-2 1-3.2 1.3a54 54 0 0 0-24 12c-3.3 3.5-3.6 7.5-3.2 12 .5 5.8 3.4 11 3.6 16.8M457.7 53.1c8 0 13 4.4 17 10.7q4.4 7.5 7.2 15.5 3.7 10.5 5.2 21.6M294.6 155.1c-1.2 1.6 0 3 .6 4.2 6 10.5 10.4 21.8 16.1 32.5q2.9 5.4 5.6 11 .9 1.7.9 3.6M189.2 403.8c-3.2-2.6-4.8-6.3-6.7-9.7-4.8-8.6-7.5-18-10-27.5q0-.4-.2-.7-.4-.7-1.3-1.5c-2 1-2.2 3-2.6 4.8l-2.4 9.4q-1.3 6.5-2.7 13l-2.8 15.2c-.2 1.2-1.4 2-1 3.5l.2.8M303 418l.8.6c1.2 1.2 2.3 2.1 4.2 1.3.8-.3 1.6.6 2.2 1a134 134 0 0 0 22 11.3c4 1.7 7.6 3.9 11.5 5.7q3.1 1.7 6.4 3 1.5.6 3 .5M325.2 158q-1-7-2-14.2c-1-4.8-1.6-9.7-2.6-14.6l-1.8-8.7c-.2-.6-.1-1.6-1-1.9M407.7 395.1c-2.9 6.9-4.8 14-7.2 21q-2.7 7.8-4.5 16c0 .3-.5.5-.4 1M326.3 190q-1.5-.1-2.5-1.1a116 116 0 0 1-16.9-18q-5.2-6.7-9.8-13.9-.2-.4-.6-.8c-3.1-1.8-3.8-5.4-5.5-8.2-2.4-3.8-4.2-7.9-6.6-11.7l-1-1.2"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M316.5 373.4q-.6 0-1 .7a10 10 0 0 1-5.6 4.2c-3.7 1.4-4.5 4.3-5.4 7.4-1.5 6-1.3 12-1.1 18 0 2.3-.2 4.7.4 7.1q.2 1 .7 1.7c1.5 2.3 3.1 4.5 3.7 7.2M396.4 82c-.8 2.5-2.8 4.2-4.2 6.4a32 32 0 0 0-4.4 8.6q-.9 2.9 1 4.9 4.3 5.4 10 9.8l3.5 2.7M385.4 500.4c-2.6-1.7-3.5-4.5-4.7-7a22 22 0 0 0-7.1-9.2c-2-1.3-6-1.4-7.7.1q-1.1.9-2.6.5c-3.5-.7-7-.5-10.4-.4-6 .2-11.8 1.7-12.4 8.3-.2 1-1.7 1.8-2.4 4"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M328.2 343.1q.8 1.8.3 3.5c-.6 2.8-.4 5.6-.6 8.4-.5 5.1-.5 10.3-.8 15.4l-.3 3q-.1 1.6-2 1.8H319c-1.2 0-2-1.2-2.3-2.5q-1.6-5.3-5.2-9.4c-1.4-1.5-2.1-1.4-3.5.2l-1 1.7M407.1 128.4c1 1.3 1.3 3 2 4.5q1.8 3.9 4.5 7.5c1.5 2.2 3.6 2.3 6 1.6a44 44 0 0 1 6.8-1.5l2-.1M307.1 379.1c-1.2-1.4-3-1.7-4.7-1.8q-3.7-.3-7.4.2a7 7 0 0 0-5.6 7c.2 5.1 2 9.8 3.5 14.5q.4 1 .7 2c.3 2.1 2 3.6 2.8 5.4.5 1 2 .8 3 .6 1.2-.2 2.4-.7 3.6-.2M289.7 340.2a41 41 0 0 0-9.2 6.4c-1.9 1.6-2 3.8-2.4 6-.4 2-.5 4.2-1.7 6.2-.6 1-.2 2.4-.6 3.6-1 3.4-2.5 6.5-3 10q-.6 2-.5 4.3c0 1.2.5 1 1.3 1l6.4-.1c1.9 0 3.8.5 5.7 0q.5-.1.7.1c1 1.2 2.5 1.5 3.7 2.5M286.4 302.8q-8.2 4.2-16 9.2l-2.4 1.4M457 53.2q-8.6 1-15.1 6.6-1 1.2-2.4 1.6M402.3 501.8c-2.4 0-4.7-.7-7-1.1q-4.3-.6-8.7-.8-1.6 0-1.2 1.8.6 2.2 1.3 4.2.4 3.2.6 6.4M456 498.6c1 1.3 2.4 2 3.7 3 2.9 2.3 5 5.2 5.1 9 0 .6.6 1.1.4 1.8M392.5 67.5c-.1.4.3.8.3 1.2-.6 3.6.7 6.7 2.4 9.8q1 1.2 1.2 2.9 0 .5.6.4"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M294.4 356.4c-2.7-.4-4.5-2.4-6.6-3.9q-3.2-2.5-6-5.5M294 403.8c-1.1 2.4-1.6 5-2.7 7.3-.9 2-2.2 3.7-2.6 5.8M366 484.7c2.5 1.7 5.2 3 7.2 5.2q1.7 1.7 3 3.7M296.5 407c-.8 1-.7 2.3-.8 3.4q-.5 3.6-.8 7M295.5 366l-.9-1.1q-1.2-1.4-2.4-.2a17 17 0 0 0-4.4 8.5q0 .6.5 1.1l3.5 3.8M253.7 313.6c-2.5 0-4.6-1.3-6.9-2q-1.5-.6-3.1-.6"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M281.7 418.6c.7-1 1.8-1 2.8-1q1.8 0 3.7-.4.1-.1.3-.1c3.7 1.3 7.6.2 11.3.9l1.6.1q1.8.1 1.8-1.7c0-1.5-.6-3 .8-4.2M343.3 376.9q2 .8 4 1.5 1 .5 2 0M317.7 375.5q-1.5 1.5-3.4.5M287.1 374c-1 1-1 2.2-1.2 3.4M338 496.7c-2.2 8.8 4.3 12.5 5.7 15.4q.5.4 1.2.2"/><ellipse cx="198.2" cy="253" rx="4.7" ry="21.5" transform="rotate(-13 198.3 253)"/><ellipse cx="301.1" cy="233.5" rx="5.1" ry="22.8" transform="rotate(-9 301 233.4)"/><g fill="currentColor"><path d="M185.9 491.2q-2.7.3-4.8-.8c-2.1-1.1-2.6-1.7-3.4-3s-1.3-3-1.5-5l-.5-7.2q0-2.8.8-5t3-3.5a8 8 0 0 1 4.5-1.5q2.7-.1 4.8.8a8 8 0 0 1 3.4 3.1q1.3 2 1.5 4.9l.5 7.2q.2 2.9-.8 5a8 8 0 0 1-2.9 3.5 9 9 0 0 1-4.6 1.5Zm-.3-3.5q2.4-.2 3.8-1.8c1.4-1.6 1.2-2.6 1.1-4.3l-.5-7.5a6 6 0 0 0-1.7-4 5 5 0 0 0-4-1.4q-2.4.2-3.7 1.9c-1.3 1.7-1.3 2.5-1.2 4.3l.5 7.4q.1 2.7 1.8 4.1c1.7 1.4 2.3 1.4 4 1.3M200.2 490l-1.7-25.5 3.2-.3 13.9 18.9-.4.5-1.4-20.2 3.5-.3 1.8 25.5-3.3.3-13.8-18.6.4-.5 1.4 19.9zM234 487.9q-4.2.3-6.8-2c-2.6-2.3-2.6-3.9-2.8-6.9l-1.2-16.2 3.6-.3L228 479q.2 2.8 1.7 4.2t4 1.3 4-1.8 1-4.4l-1.1-16.4 3.6-.3 1.1 16.3q.3 4.5-1.9 7.2a9 9 0 0 1-6.4 2.9Z"/></g></svg>';

function card(title, cls) {
  const c = el('div', 'cbi-section' + (cls ? ' ' + cls : ''));
  c.append(el('h3', null, title));
  return c;
}

function link(href, text) {
  const a = el('a', null, text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

/* A LuCI key/value table; a value is text, a node, or a list of both. */
function kvTable(rows) {
  const t = el('table', 'nj-kv');
  for (const [label, value] of rows) {
    const tr = el('tr');
    const td = el('td');
    for (const v of [value].flat(Infinity)) {
      if (v === null || v === undefined || v === '') continue;
      td.append(v instanceof Node ? v : document.createTextNode(v));
    }
    if (!td.childNodes.length) td.textContent = DASH;
    tr.append(el('td', 'left', label), td);
    t.append(tr);
  }
  return t;
}

/* A short commit hash, as text or a link to it on GitHub. */
const isRev = (r) => typeof r === 'string' && /^[0-9a-f]{7,40}$/.test(r);
function rev(repo, r) {
  if (!isRev(r)) return r || null;
  return link(repo + '/commit/' + r, r.slice(0, 7));
}

/* A release name with its commit: "v1.19.0 (e5dbb6b)". */
function release(repo, tag, r) {
  if (!tag && !r) return null;
  const out = [];
  if (tag && tag !== 'unknown') out.push(/^v\d/.test(tag) ? link(repo + '/releases/tag/' + tag, tag) : tag);
  if (isRev(r)) out.push(out.length ? ' (' : '', rev(repo, r), out.length ? ')' : '');
  return out.length ? out : null;
}

/* nijika-luna-261122-04f252c-dev: the release, date and commit, and the
   variant (dev, root with no password; oem, the published one). */
function lunaRelease(image) {
  const m = /^nijika-luna-(\d{6})-([0-9a-f]{7,}(?:-dirty)?)-(dev|oem)$/.exec(image || '');
  if (!m) return image || null;
  const d = m[1];
  return `${m[2]} (20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}, ${m[3] === 'oem' ? 'OEM' : 'Development'})`;
}

/* nijika_ui is a commit of the fork, "-dirty" when built from uncommitted
   work. */
function nijikaUi(v) {
  if (!v || v === 'unknown') return null;
  const m = /^([0-9a-f]{7,40})(-dirty)?$/.exec(v);
  if (!m) return v;
  return [rev(REPO.nijikaUi, m[1]), m[2] ? ' (modified)' : ''];
}

function partitionText(env) {
  const a = env.sw_active;
  const c = env.sw_commit;
  if (a !== '0' && a !== '1') return null;
  if (c === a) return `Partition ${a} (committed)`;
  if (c === '0' || c === '1') return `Partition ${a} (trial, committed partition is ${c})`;
  return `Partition ${a}`;
}

function renderAbout(host) {
  const fw = S.FW || {};
  const build = fw.build || {};
  const env = fw.env || {};
  const slot = (fw.slots || {})[env.sw_active] || {};
  const image = build.image || fw.running || null;

  /* --- the banner -------------------------------------------------------- */

  const hero = el('div', 'cbi-section nj-about-hero');
  const art = el('div', 'nj-mascot');
  art.innerHTML = MASCOT;
  const text = el('div', 'nj-about-text');
  text.append(el('h3', 'nj-about-name', 'NIJIKA Luna'),
    el('p', null, 'GPON ONU firmware for the GPON ONU SFP (RTL9601D), built on ODI OSS.'));
  const chips = el('p', 'nj-chips');
  if (image) chips.append(el('span', 'nj-chip', image));
  if (build.built) chips.append(el('span', 'nj-chip', 'Built ' + build.built));
  text.append(chips);
  hero.append(art, text);

  /* --- the firmware ------------------------------------------------------ */

  const info = card('Firmware Information');
  const patches = Number(build.luna_patches);
  info.append(kvTable([
    ['Firmware Version', image],
    ['Build Time', build.built],
    ['Nijika Luna', lunaRelease(build.image)],
    ['Nijika UI', nijikaUi(build.nijika_ui)],
    ['ODI OSS', [release(REPO.oss, build.odi_oss, build.odi_oss_rev),
      patches > 0 ? ` + ${patches} Nijika Luna patch${patches === 1 ? '' : 'es'}` : null]],
    ['ODI UI', release(REPO.ui, build.odi_ui, build.odi_ui_rev)],
    ['Web Server (confd)', fw.confd],
  ]));

  /* --- the system -------------------------------------------------------- */

  const sys = card('System Information');
  sys.append(kvTable([
    ['Kernel Version', build.kernel ? 'Linux ' + build.kernel : slot.kernel],
    ['Current Partition', partitionText(env)],
    ['Model', 'GPON-ONU-SFP2GFX'],
    ['Platform', 'Realtek RTL9601D'],
  ]));

  /* --- the credits ------------------------------------------------------- */

  const credits = card('Credits');
  const cb = el('div', 'cbi-section-body nj-about-list');
  const ul = el('ul');
  const li = (...parts) => { const l = el('li'); l.append(...parts); ul.append(l); };
  li(link('https://github.com/AndreZiviani', 'Andre Ziviani'),
    ': ODI OSS and ODI UI, the open firmware and web interface this firmware is built on.');
  li('10G PON members: ', link('https://github.com/YuukiJapanTech', 'YuukiJapanTech'), ', ',
    link('https://github.com/djGrrr', 'djGrrr'), '.');
  li(link('https://openpon.org/', 'Open PON Foundation'),
    ': a vendor-neutral effort for open and interoperable PON.');
  li('Peter-Pon by Pedro Teixeira (metal-stress): UX inspiration of this web interface.');
  li('Contributors: AndreZiviani, Anime4000, CATCrypt, metal-stress, rajkosto, stich86.');
  cb.append(ul);
  credits.append(cb);

  /* --- the notices ------------------------------------------------------- */

  const legal = card('Legal Notice');
  const lb = el('div', 'cbi-section-body nj-about-list');
  const lul = el('ul');
  for (const t of [
    'This firmware may contain OMCI functions and protocol handling specific to an equipment vendor or an ISP. '
      + 'These parts are provided for interoperability only, and their source code may not be published.',
    'The open source components are distributed under their own licenses (GPL-2.0 and others). '
      + 'Their source code is available from the repositories listed above.',
    'Vendor, ISP and product names are trademarks of their respective owners. '
      + 'They are used only to identify compatible equipment. This firmware is not made, approved or supported by them.',
    'This firmware is provided "AS IS", without warranty of any kind. '
      + 'The authors are not liable for any damage or loss of service from its use.',
  ]) lul.append(el('li', null, t));
  lb.append(lul);
  legal.append(lb);

  const ops = card('Operation Notice');
  const ob = el('div', 'cbi-section-body nj-about-list');
  const oul = el('ul');
  for (const t of [
    'A PON is shared: one fibre serves many subscribers. A wrong setting of the ONU '
      + '(serial number, LOID, password, OMCI or optical) can affect the service of other users on the same PON.',
    'Connect the SFP only to a line you are authorized to use, and follow the terms of your ISP.',
    'Before you change the GPON settings, consult your ISP or a qualified network engineer.',
    'The user is responsible for the operation of this device on the PON network.',
  ]) oul.append(el('li', null, t));
  ob.append(oul);
  ops.append(ob);

  const lede = el('p', 'lede', 'This page shows the firmware version, the open source components, the credits and the notices of the SFP.');
  host.append(lede, hero, info, sys, credits, legal, ops);
  return null;
}

export { renderAbout };
