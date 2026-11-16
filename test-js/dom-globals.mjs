import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost' });
for(const key of ['window','document','HTMLElement','Node','MutationObserver'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true,writable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.__LISTENING_TEST_DOM__ = dom;
import('node:test').then(({after})=>after(()=>{dom.window.close();}));
