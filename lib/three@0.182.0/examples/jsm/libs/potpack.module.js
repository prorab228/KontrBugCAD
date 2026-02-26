/**
 * potpack - by [@mourner](https://github.com/mourner)
 * 
 * A tiny JavaScript function for packing 2D rectangles into a near-square container, 
 * which is useful for generating CSS sprites and WebGL textures. Similar to 
 * [shelf-pack](https://github.com/mapbox/shelf-pack), but static (you can't add items 
 * once a layout is generated), and aims for maximal space utilization.
 *
 * A variation of algorithms used in [rectpack2D](https://github.com/TeamHypersomnia/rectpack2D)
 * and [bin-pack](https://github.com/bryanburgers/bin-pack), which are in turn based 
 * on [this article by Blackpawn](http://blackpawn.com/texts/lightmaps/default.html).
 * 
 * @license
 * ISC License
 * 
 * Copyright (c) 2018, Mapbox
 * 
 * Permission to use, copy, modify, and/or distribute this software for any purpose
 * with or without fee is hereby granted, provided that the above copyright notice
 * and this permission notice appear in all copies.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 * REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
 * FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 * INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
 * OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
 * TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
 * THIS SOFTWARE.
 */
function potpack(h){let t=0,w=0;for(const o of h)t+=o.w*o.h,w=Math.max(w,o.w);h.sort((h,t)=>t.h-h.h);const o=[{x:0,y:0,w:Math.max(Math.ceil(Math.sqrt(t/.95)),w),h:1/0}];let a=0,x=0;for(const t of h)for(let h=o.length-1;h>=0;h--){const w=o[h];if(!(t.w>w.w||t.h>w.h)){if(t.x=w.x,t.y=w.y,x=Math.max(x,t.y+t.h),a=Math.max(a,t.x+t.w),t.w===w.w&&t.h===w.h){const t=o.pop();h<o.length&&(o[h]=t)}else t.h===w.h?(w.x+=t.w,w.w-=t.w):t.w===w.w?(w.y+=t.h,w.h-=t.h):(o.push({x:w.x+t.w,y:w.y,w:w.w-t.w,h:t.h}),w.y+=t.h,w.h-=t.h);break}}return{w:a,h:x,fill:t/(a*x)||0}}export{potpack};