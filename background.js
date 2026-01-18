// EspressoMonkey v1.0.0 - Background Service Worker
// Comprehensive userscript manager with cloud sync and auto-updates
// v1.0.0: Fixed @require global scope issues (GM_config), improved DOM timing helpers

// ============================================================================
// INLINED: fflate v0.8.2 - Browser-only ZIP library
// ============================================================================
(function() {
  'use strict';
  try {
// DEFLATE is a complex format; to read this code, you should probably check the RFC first:
// https://tools.ietf.org/html/rfc1951
// You may also wish to take a look at the guide I made about this program:
// https://gist.github.com/101arrowz/253f31eb5abc3d9275ab943003ffecad
// Some of the following code is similar to that of UZIP.js:
// https://github.com/photopea/UZIP.js
// However, the vast majority of the codebase has diverged from UZIP.js to increase performance and reduce bundle size.
// Sometimes 0 will appear where -1 would be more appropriate. This is because using a uint
// is better for memory in most engines (I *think*).
var ch2 = {};
var wk = (function (c, id, msg, transfer, cb) {
    var w = new Worker(ch2[id] || (ch2[id] = URL.createObjectURL(new Blob([
        c + ';addEventListener("error",function(e){e=e.error;postMessage({$e$:[e.message,e.code,e.stack]})})'
    ], { type: 'text/javascript' }))));
    w.onmessage = function (e) {
        var d = e.data, ed = d.$e$;
        if (ed) {
            var err = new Error(ed[0]);
            err['code'] = ed[1];
            err.stack = ed[2];
            cb(err, null);
        }
        else
            cb(null, d);
    };
    w.postMessage(msg, transfer);
    return w;
});

// aliases for shorter compressed code (most minifers don't do this)
var u8 = Uint8Array, u16 = Uint16Array, i32 = Int32Array;
// fixed length extra bits
var fleb = new u8([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, /* unused */ 0, 0, /* impossible */ 0]);
// fixed distance extra bits
var fdeb = new u8([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, /* unused */ 0, 0]);
// code length index map
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
// get base, reverse index map from extra bits
var freb = function (eb, start) {
    var b = new u16(31);
    for (var i = 0; i < 31; ++i) {
        b[i] = start += 1 << eb[i - 1];
    }
    // numbers here are at max 18 bits
    var r = new i32(b[30]);
    for (var i = 1; i < 30; ++i) {
        for (var j = b[i]; j < b[i + 1]; ++j) {
            r[j] = ((j - b[i]) << 5) | i;
        }
    }
    return { b: b, r: r };
};
var _a = freb(fleb, 2), fl = _a.b, revfl = _a.r;
// we can ignore the fact that the other numbers are wrong; they never happen anyway
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0), fd = _b.b, revfd = _b.r;
// map of value to reverse (assuming 16 bits)
var rev = new u16(32768);
for (var i = 0; i < 32768; ++i) {
    // reverse table algorithm from SO
    var x = ((i & 0xAAAA) >> 1) | ((i & 0x5555) << 1);
    x = ((x & 0xCCCC) >> 2) | ((x & 0x3333) << 2);
    x = ((x & 0xF0F0) >> 4) | ((x & 0x0F0F) << 4);
    rev[i] = (((x & 0xFF00) >> 8) | ((x & 0x00FF) << 8)) >> 1;
}
// create huffman tree from u8 "map": index -> code length for code index
// mb (max bits) must be at most 15
// TODO: optimize/split up?
var hMap = (function (cd, mb, r) {
    var s = cd.length;
    // index
    var i = 0;
    // u16 "map": index -> # of codes with bit length = index
    var l = new u16(mb);
    // length of cd must be 288 (total # of codes)
    for (; i < s; ++i) {
        if (cd[i])
            ++l[cd[i] - 1];
    }
    // u16 "map": index -> minimum code for bit length = index
    var le = new u16(mb);
    for (i = 1; i < mb; ++i) {
        le[i] = (le[i - 1] + l[i - 1]) << 1;
    }
    var co;
    if (r) {
        // u16 "map": index -> number of actual bits, symbol for code
        co = new u16(1 << mb);
        // bits to remove for reverser
        var rvb = 15 - mb;
        for (i = 0; i < s; ++i) {
            // ignore 0 lengths
            if (cd[i]) {
                // num encoding both symbol and bits read
                var sv = (i << 4) | cd[i];
                // free bits
                var r_1 = mb - cd[i];
                // start value
                var v = le[cd[i] - 1]++ << r_1;
                // m is end value
                for (var m = v | ((1 << r_1) - 1); v <= m; ++v) {
                    // every 16 bit value starting with the code yields the same result
                    co[rev[v] >> rvb] = sv;
                }
            }
        }
    }
    else {
        co = new u16(s);
        for (i = 0; i < s; ++i) {
            if (cd[i]) {
                co[i] = rev[le[cd[i] - 1]++] >> (15 - cd[i]);
            }
        }
    }
    return co;
});
// fixed length tree
var flt = new u8(288);
for (var i = 0; i < 144; ++i)
    flt[i] = 8;
for (var i = 144; i < 256; ++i)
    flt[i] = 9;
for (var i = 256; i < 280; ++i)
    flt[i] = 7;
for (var i = 280; i < 288; ++i)
    flt[i] = 8;
// fixed distance tree
var fdt = new u8(32);
for (var i = 0; i < 32; ++i)
    fdt[i] = 5;
// fixed length map
var flm = /*#__PURE__*/ hMap(flt, 9, 0), flrm = /*#__PURE__*/ hMap(flt, 9, 1);
// fixed distance map
var fdm = /*#__PURE__*/ hMap(fdt, 5, 0), fdrm = /*#__PURE__*/ hMap(fdt, 5, 1);
// find max of array
var max = function (a) {
    var m = a[0];
    for (var i = 1; i < a.length; ++i) {
        if (a[i] > m)
            m = a[i];
    }
    return m;
};
// read d, starting at bit p and mask with m
var bits = function (d, p, m) {
    var o = (p / 8) | 0;
    return ((d[o] | (d[o + 1] << 8)) >> (p & 7)) & m;
};
// read d, starting at bit p continuing for at least 16 bits
var bits16 = function (d, p) {
    var o = (p / 8) | 0;
    return ((d[o] | (d[o + 1] << 8) | (d[o + 2] << 16)) >> (p & 7));
};
// get end of byte
var shft = function (p) { return ((p + 7) / 8) | 0; };
// typed array slice - allows garbage collector to free original reference,
// while being more compatible than .slice
var slc = function (v, s, e) {
    if (s == null || s < 0)
        s = 0;
    if (e == null || e > v.length)
        e = v.length;
    // can't use .constructor in case user-supplied
    return new u8(v.subarray(s, e));
};
/**
 * Codes for errors generated within this library
 */
var FlateErrorCode = {
    UnexpectedEOF: 0,
    InvalidBlockType: 1,
    InvalidLengthLiteral: 2,
    InvalidDistance: 3,
    StreamFinished: 4,
    NoStreamHandler: 5,
    InvalidHeader: 6,
    NoCallback: 7,
    InvalidUTF8: 8,
    ExtraFieldTooLong: 9,
    InvalidDate: 10,
    FilenameTooLong: 11,
    StreamFinishing: 12,
    InvalidZipData: 13,
    UnknownCompressionMethod: 14
};
// error codes
var ec = [
    'unexpected EOF',
    'invalid block type',
    'invalid length/literal',
    'invalid distance',
    'stream finished',
    'no stream handler',
    ,
    'no callback',
    'invalid UTF-8 data',
    'extra field too long',
    'date not in range 1980-2099',
    'filename too long',
    'stream finishing',
    'invalid zip data'
    // determined by unknown compression method
];
;
var err = function (ind, msg, nt) {
    var e = new Error(msg || ec[ind]);
    e.code = ind;
    if (Error.captureStackTrace)
        Error.captureStackTrace(e, err);
    if (!nt)
        throw e;
    return e;
};
// expands raw DEFLATE data
var inflt = function (dat, st, buf, dict) {
    // source length       dict length
    var sl = dat.length, dl = dict ? dict.length : 0;
    if (!sl || st.f && !st.l)
        return buf || new u8(0);
    var noBuf = !buf;
    // have to estimate size
    var resize = noBuf || st.i != 2;
    // no state
    var noSt = st.i;
    // Assumes roughly 33% compression ratio average
    if (noBuf)
        buf = new u8(sl * 3);
    // ensure buffer can fit at least l elements
    var cbuf = function (l) {
        var bl = buf.length;
        // need to increase size to fit
        if (l > bl) {
            // Double or set to necessary, whichever is greater
            var nbuf = new u8(Math.max(bl * 2, l));
            nbuf.set(buf);
            buf = nbuf;
        }
    };
    //  last chunk         bitpos           bytes
    var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
    // total bits
    var tbts = sl * 8;
    do {
        if (!lm) {
            // BFINAL - this is only 1 when last chunk is next
            final = bits(dat, pos, 1);
            // type: 0 = no compression, 1 = fixed huffman, 2 = dynamic huffman
            var type = bits(dat, pos + 1, 3);
            pos += 3;
            if (!type) {
                // go to end of byte boundary
                var s = shft(pos) + 4, l = dat[s - 4] | (dat[s - 3] << 8), t = s + l;
                if (t > sl) {
                    if (noSt)
                        err(0);
                    break;
                }
                // ensure size
                if (resize)
                    cbuf(bt + l);
                // Copy over uncompressed data
                buf.set(dat.subarray(s, t), bt);
                // Get new bitpos, update byte count
                st.b = bt += l, st.p = pos = t * 8, st.f = final;
                continue;
            }
            else if (type == 1)
                lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
            else if (type == 2) {
                //  literal                            lengths
                var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
                var tl = hLit + bits(dat, pos + 5, 31) + 1;
                pos += 14;
                // length+distance tree
                var ldt = new u8(tl);
                // code length tree
                var clt = new u8(19);
                for (var i = 0; i < hcLen; ++i) {
                    // use index map to get real code
                    clt[clim[i]] = bits(dat, pos + i * 3, 7);
                }
                pos += hcLen * 3;
                // code lengths bits
                var clb = max(clt), clbmsk = (1 << clb) - 1;
                // code lengths map
                var clm = hMap(clt, clb, 1);
                for (var i = 0; i < tl;) {
                    var r = clm[bits(dat, pos, clbmsk)];
                    // bits read
                    pos += r & 15;
                    // symbol
                    var s = r >> 4;
                    // code length to copy
                    if (s < 16) {
                        ldt[i++] = s;
                    }
                    else {
                        //  copy   count
                        var c = 0, n = 0;
                        if (s == 16)
                            n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
                        else if (s == 17)
                            n = 3 + bits(dat, pos, 7), pos += 3;
                        else if (s == 18)
                            n = 11 + bits(dat, pos, 127), pos += 7;
                        while (n--)
                            ldt[i++] = c;
                    }
                }
                //    length tree                 distance tree
                var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
                // max length bits
                lbt = max(lt);
                // max dist bits
                dbt = max(dt);
                lm = hMap(lt, lbt, 1);
                dm = hMap(dt, dbt, 1);
            }
            else
                err(1);
            if (pos > tbts) {
                if (noSt)
                    err(0);
                break;
            }
        }
        // Make sure the buffer can hold this + the largest possible addition
        // Maximum chunk size (practically, theoretically infinite) is 2^17
        if (resize)
            cbuf(bt + 131072);
        var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
        var lpos = pos;
        for (;; lpos = pos) {
            // bits read, code
            var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
            pos += c & 15;
            if (pos > tbts) {
                if (noSt)
                    err(0);
                break;
            }
            if (!c)
                err(2);
            if (sym < 256)
                buf[bt++] = sym;
            else if (sym == 256) {
                lpos = pos, lm = null;
                break;
            }
            else {
                var add = sym - 254;
                // no extra bits needed if less
                if (sym > 264) {
                    // index
                    var i = sym - 257, b = fleb[i];
                    add = bits(dat, pos, (1 << b) - 1) + fl[i];
                    pos += b;
                }
                // dist
                var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
                if (!d)
                    err(3);
                pos += d & 15;
                var dt = fd[dsym];
                if (dsym > 3) {
                    var b = fdeb[dsym];
                    dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
                }
                if (pos > tbts) {
                    if (noSt)
                        err(0);
                    break;
                }
                if (resize)
                    cbuf(bt + 131072);
                var end = bt + add;
                if (bt < dt) {
                    var shift = dl - dt, dend = Math.min(dt, end);
                    if (shift + bt < 0)
                        err(3);
                    for (; bt < dend; ++bt)
                        buf[bt] = dict[shift + bt];
                }
                for (; bt < end; ++bt)
                    buf[bt] = buf[bt - dt];
            }
        }
        st.l = lm, st.p = lpos, st.b = bt, st.f = final;
        if (lm)
            final = 1, st.m = lbt, st.d = dm, st.n = dbt;
    } while (!final);
    // don't reallocate for streams or user buffers
    return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
// starting at p, write the minimum number of bits that can hold v to d
var wbits = function (d, p, v) {
    v <<= p & 7;
    var o = (p / 8) | 0;
    d[o] |= v;
    d[o + 1] |= v >> 8;
};
// starting at p, write the minimum number of bits (>8) that can hold v to d
var wbits16 = function (d, p, v) {
    v <<= p & 7;
    var o = (p / 8) | 0;
    d[o] |= v;
    d[o + 1] |= v >> 8;
    d[o + 2] |= v >> 16;
};
// creates code lengths from a frequency table
var hTree = function (d, mb) {
    // Need extra info to make a tree
    var t = [];
    for (var i = 0; i < d.length; ++i) {
        if (d[i])
            t.push({ s: i, f: d[i] });
    }
    var s = t.length;
    var t2 = t.slice();
    if (!s)
        return { t: et, l: 0 };
    if (s == 1) {
        var v = new u8(t[0].s + 1);
        v[t[0].s] = 1;
        return { t: v, l: 1 };
    }
    t.sort(function (a, b) { return a.f - b.f; });
    // after i2 reaches last ind, will be stopped
    // freq must be greater than largest possible number of symbols
    t.push({ s: -1, f: 25001 });
    var l = t[0], r = t[1], i0 = 0, i1 = 1, i2 = 2;
    t[0] = { s: -1, f: l.f + r.f, l: l, r: r };
    // efficient algorithm from UZIP.js
    // i0 is lookbehind, i2 is lookahead - after processing two low-freq
    // symbols that combined have high freq, will start processing i2 (high-freq,
    // non-composite) symbols instead
    // see https://reddit.com/r/photopea/comments/ikekht/uzipjs_questions/
    while (i1 != s - 1) {
        l = t[t[i0].f < t[i2].f ? i0++ : i2++];
        r = t[i0 != i1 && t[i0].f < t[i2].f ? i0++ : i2++];
        t[i1++] = { s: -1, f: l.f + r.f, l: l, r: r };
    }
    var maxSym = t2[0].s;
    for (var i = 1; i < s; ++i) {
        if (t2[i].s > maxSym)
            maxSym = t2[i].s;
    }
    // code lengths
    var tr = new u16(maxSym + 1);
    // max bits in tree
    var mbt = ln(t[i1 - 1], tr, 0);
    if (mbt > mb) {
        // more algorithms from UZIP.js
        // TODO: find out how this code works (debt)
        //  ind    debt
        var i = 0, dt = 0;
        //    left            cost
        var lft = mbt - mb, cst = 1 << lft;
        t2.sort(function (a, b) { return tr[b.s] - tr[a.s] || a.f - b.f; });
        for (; i < s; ++i) {
            var i2_1 = t2[i].s;
            if (tr[i2_1] > mb) {
                dt += cst - (1 << (mbt - tr[i2_1]));
                tr[i2_1] = mb;
            }
            else
                break;
        }
        dt >>= lft;
        while (dt > 0) {
            var i2_2 = t2[i].s;
            if (tr[i2_2] < mb)
                dt -= 1 << (mb - tr[i2_2]++ - 1);
            else
                ++i;
        }
        for (; i >= 0 && dt; --i) {
            var i2_3 = t2[i].s;
            if (tr[i2_3] == mb) {
                --tr[i2_3];
                ++dt;
            }
        }
        mbt = mb;
    }
    return { t: new u8(tr), l: mbt };
};
// get the max length and assign length codes
var ln = function (n, l, d) {
    return n.s == -1
        ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1))
        : (l[n.s] = d);
};
// length codes generation
var lc = function (c) {
    var s = c.length;
    // Note that the semicolon was intentional
    while (s && !c[--s])
        ;
    var cl = new u16(++s);
    //  ind      num         streak
    var cli = 0, cln = c[0], cls = 1;
    var w = function (v) { cl[cli++] = v; };
    for (var i = 1; i <= s; ++i) {
        if (c[i] == cln && i != s)
            ++cls;
        else {
            if (!cln && cls > 2) {
                for (; cls > 138; cls -= 138)
                    w(32754);
                if (cls > 2) {
                    w(cls > 10 ? ((cls - 11) << 5) | 28690 : ((cls - 3) << 5) | 12305);
                    cls = 0;
                }
            }
            else if (cls > 3) {
                w(cln), --cls;
                for (; cls > 6; cls -= 6)
                    w(8304);
                if (cls > 2)
                    w(((cls - 3) << 5) | 8208), cls = 0;
            }
            while (cls--)
                w(cln);
            cls = 1;
            cln = c[i];
        }
    }
    return { c: cl.subarray(0, cli), n: s };
};
// calculate the length of output from tree, code lengths
var clen = function (cf, cl) {
    var l = 0;
    for (var i = 0; i < cl.length; ++i)
        l += cf[i] * cl[i];
    return l;
};
// writes a fixed block
// returns the new bit pos
var wfblk = function (out, pos, dat) {
    // no need to write 00 as type: TypedArray defaults to 0
    var s = dat.length;
    var o = shft(pos + 2);
    out[o] = s & 255;
    out[o + 1] = s >> 8;
    out[o + 2] = out[o] ^ 255;
    out[o + 3] = out[o + 1] ^ 255;
    for (var i = 0; i < s; ++i)
        out[o + i + 4] = dat[i];
    return (o + 4 + s) * 8;
};
// writes a block
var wblk = function (dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
    wbits(out, p++, final);
    ++lf[256];
    var _a = hTree(lf, 15), dlt = _a.t, mlb = _a.l;
    var _b = hTree(df, 15), ddt = _b.t, mdb = _b.l;
    var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
    var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
    var lcfreq = new u16(19);
    for (var i = 0; i < lclt.length; ++i)
        ++lcfreq[lclt[i] & 31];
    for (var i = 0; i < lcdt.length; ++i)
        ++lcfreq[lcdt[i] & 31];
    var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
    var nlcc = 19;
    for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
        ;
    var flen = (bl + 5) << 3;
    var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
    var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
    if (bs >= 0 && flen <= ftlen && flen <= dtlen)
        return wfblk(out, p, dat.subarray(bs, bs + bl));
    var lm, ll, dm, dl;
    wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
    if (dtlen < ftlen) {
        lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
        var llm = hMap(lct, mlcb, 0);
        wbits(out, p, nlc - 257);
        wbits(out, p + 5, ndc - 1);
        wbits(out, p + 10, nlcc - 4);
        p += 14;
        for (var i = 0; i < nlcc; ++i)
            wbits(out, p + 3 * i, lct[clim[i]]);
        p += 3 * nlcc;
        var lcts = [lclt, lcdt];
        for (var it = 0; it < 2; ++it) {
            var clct = lcts[it];
            for (var i = 0; i < clct.length; ++i) {
                var len = clct[i] & 31;
                wbits(out, p, llm[len]), p += lct[len];
                if (len > 15)
                    wbits(out, p, (clct[i] >> 5) & 127), p += clct[i] >> 12;
            }
        }
    }
    else {
        lm = flm, ll = flt, dm = fdm, dl = fdt;
    }
    for (var i = 0; i < li; ++i) {
        var sym = syms[i];
        if (sym > 255) {
            var len = (sym >> 18) & 31;
            wbits16(out, p, lm[len + 257]), p += ll[len + 257];
            if (len > 7)
                wbits(out, p, (sym >> 23) & 31), p += fleb[len];
            var dst = sym & 31;
            wbits16(out, p, dm[dst]), p += dl[dst];
            if (dst > 3)
                wbits16(out, p, (sym >> 5) & 8191), p += fdeb[dst];
        }
        else {
            wbits16(out, p, lm[sym]), p += ll[sym];
        }
    }
    wbits16(out, p, lm[256]);
    return p + ll[256];
};
// deflate options (nice << 13) | chain
var deo = /*#__PURE__*/ new i32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
// empty
var et = /*#__PURE__*/ new u8(0);
// compresses data into a raw DEFLATE buffer
var dflt = function (dat, lvl, plvl, pre, post, st) {
    var s = st.z || dat.length;
    var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7000)) + post);
    // writing to this writes to the output buffer
    var w = o.subarray(pre, o.length - post);
    var lst = st.l;
    var pos = (st.r || 0) & 7;
    if (lvl) {
        if (pos)
            w[0] = st.r >> 3;
        var opt = deo[lvl - 1];
        var n = opt >> 13, c = opt & 8191;
        var msk_1 = (1 << plvl) - 1;
        //    prev 2-byte val map    curr 2-byte val map
        var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
        var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
        var hsh = function (i) { return (dat[i] ^ (dat[i + 1] << bs1_1) ^ (dat[i + 2] << bs2_1)) & msk_1; };
        // 24576 is an arbitrary number of maximum symbols per block
        // 424 buffer for last block
        var syms = new i32(25000);
        // length/literal freq   distance freq
        var lf = new u16(288), df = new u16(32);
        //  l/lcnt  exbits  index          l/lind  waitdx          blkpos
        var lc_1 = 0, eb = 0, i = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
        for (; i + 2 < s; ++i) {
            // hash value
            var hv = hsh(i);
            // index mod 32768    previous index mod
            var imod = i & 32767, pimod = head[hv];
            prev[imod] = pimod;
            head[hv] = imod;
            // We always should modify head and prev, but only add symbols if
            // this data is not yet processed ("wait" for wait index)
            if (wi <= i) {
                // bytes remaining
                var rem = s - i;
                if ((lc_1 > 7000 || li > 24576) && (rem > 423 || !lst)) {
                    pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos);
                    li = lc_1 = eb = 0, bs = i;
                    for (var j = 0; j < 286; ++j)
                        lf[j] = 0;
                    for (var j = 0; j < 30; ++j)
                        df[j] = 0;
                }
                //  len    dist   chain
                var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
                if (rem > 2 && hv == hsh(i - dif)) {
                    var maxn = Math.min(n, rem) - 1;
                    var maxd = Math.min(32767, i);
                    // max possible length
                    // not capped at dif because decompressors implement "rolling" index population
                    var ml = Math.min(258, rem);
                    while (dif <= maxd && --ch_1 && imod != pimod) {
                        if (dat[i + l] == dat[i + l - dif]) {
                            var nl = 0;
                            for (; nl < ml && dat[i + nl] == dat[i + nl - dif]; ++nl)
                                ;
                            if (nl > l) {
                                l = nl, d = dif;
                                // break out early when we reach "nice" (we are satisfied enough)
                                if (nl > maxn)
                                    break;
                                // now, find the rarest 2-byte sequence within this
                                // length of literals and search for that instead.
                                // Much faster than just using the start
                                var mmd = Math.min(dif, nl - 2);
                                var md = 0;
                                for (var j = 0; j < mmd; ++j) {
                                    var ti = i - dif + j & 32767;
                                    var pti = prev[ti];
                                    var cd = ti - pti & 32767;
                                    if (cd > md)
                                        md = cd, pimod = ti;
                                }
                            }
                        }
                        // check the previous match
                        imod = pimod, pimod = prev[imod];
                        dif += imod - pimod & 32767;
                    }
                }
                // d will be nonzero only when a match was found
                if (d) {
                    // store both dist and len data in one int32
                    // Make sure this is recognized as a len/dist with 28th bit (2^28)
                    syms[li++] = 268435456 | (revfl[l] << 18) | revfd[d];
                    var lin = revfl[l] & 31, din = revfd[d] & 31;
                    eb += fleb[lin] + fdeb[din];
                    ++lf[257 + lin];
                    ++df[din];
                    wi = i + l;
                    ++lc_1;
                }
                else {
                    syms[li++] = dat[i];
                    ++lf[dat[i]];
                }
            }
        }
        for (i = Math.max(i, wi); i < s; ++i) {
            syms[li++] = dat[i];
            ++lf[dat[i]];
        }
        pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos);
        if (!lst) {
            st.r = (pos & 7) | w[(pos / 8) | 0] << 3;
            // shft(pos) now 1 less if pos & 7 != 0
            pos -= 7;
            st.h = head, st.p = prev, st.i = i, st.w = wi;
        }
    }
    else {
        for (var i = st.w || 0; i < s + lst; i += 65535) {
            // end
            var e = i + 65535;
            if (e >= s) {
                // write final block
                w[(pos / 8) | 0] = lst;
                e = s;
            }
            pos = wfblk(w, pos + 1, dat.subarray(i, e));
        }
        st.i = s;
    }
    return slc(o, 0, pre + shft(pos) + post);
};
// CRC32 table
var crct = /*#__PURE__*/ (function () {
    var t = new Int32Array(256);
    for (var i = 0; i < 256; ++i) {
        var c = i, k = 9;
        while (--k)
            c = ((c & 1) && -306674912) ^ (c >>> 1);
        t[i] = c;
    }
    return t;
})();
// CRC32
var crc = function () {
    var c = -1;
    return {
        p: function (d) {
            // closures have awful performance
            var cr = c;
            for (var i = 0; i < d.length; ++i)
                cr = crct[(cr & 255) ^ d[i]] ^ (cr >>> 8);
            c = cr;
        },
        d: function () { return ~c; }
    };
};
// Adler32
var adler = function () {
    var a = 1, b = 0;
    return {
        p: function (d) {
            // closures have awful performance
            var n = a, m = b;
            var l = d.length | 0;
            for (var i = 0; i != l;) {
                var e = Math.min(i + 2655, l);
                for (; i < e; ++i)
                    m += n += d[i];
                n = (n & 65535) + 15 * (n >> 16), m = (m & 65535) + 15 * (m >> 16);
            }
            a = n, b = m;
        },
        d: function () {
            a %= 65521, b %= 65521;
            return (a & 255) << 24 | (a & 0xFF00) << 8 | (b & 255) << 8 | (b >> 8);
        }
    };
};
;
// deflate with opts
var dopt = function (dat, opt, pre, post, st) {
    if (!st) {
        st = { l: 1 };
        if (opt.dictionary) {
            var dict = opt.dictionary.subarray(-32768);
            var newDat = new u8(dict.length + dat.length);
            newDat.set(dict);
            newDat.set(dat, dict.length);
            dat = newDat;
            st.w = dict.length;
        }
    }
    return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? (st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20) : (12 + opt.mem), pre, post, st);
};
// Walmart object spread
var mrg = function (a, b) {
    var o = {};
    for (var k in a)
        o[k] = a[k];
    for (var k in b)
        o[k] = b[k];
    return o;
};
// worker clone
// This is possibly the craziest part of the entire codebase, despite how simple it may seem.
// The only parameter to this function is a closure that returns an array of variables outside of the function scope.
// We're going to try to figure out the variable names used in the closure as strings because that is crucial for workerization.
// We will return an object mapping of true variable name to value (basically, the current scope as a JS object).
// The reason we can't just use the original variable names is minifiers mangling the toplevel scope.
// This took me three weeks to figure out how to do.
var wcln = function (fn, fnStr, td) {
    var dt = fn();
    var st = fn.toString();
    var ks = st.slice(st.indexOf('[') + 1, st.lastIndexOf(']')).replace(/\s+/g, '').split(',');
    for (var i = 0; i < dt.length; ++i) {
        var v = dt[i], k = ks[i];
        if (typeof v == 'function') {
            fnStr += ';' + k + '=';
            var st_1 = v.toString();
            if (v.prototype) {
                // for global objects
                if (st_1.indexOf('[native code]') != -1) {
                    var spInd = st_1.indexOf(' ', 8) + 1;
                    fnStr += st_1.slice(spInd, st_1.indexOf('(', spInd));
                }
                else {
                    fnStr += st_1;
                    for (var t in v.prototype)
                        fnStr += ';' + k + '.prototype.' + t + '=' + v.prototype[t].toString();
                }
            }
            else
                fnStr += st_1;
        }
        else
            td[k] = v;
    }
    return fnStr;
};
var ch = [];
// clone bufs
var cbfs = function (v) {
    var tl = [];
    for (var k in v) {
        if (v[k].buffer) {
            tl.push((v[k] = new v[k].constructor(v[k])).buffer);
        }
    }
    return tl;
};
// use a worker to execute code
var wrkr = function (fns, init, id, cb) {
    if (!ch[id]) {
        var fnStr = '', td_1 = {}, m = fns.length - 1;
        for (var i = 0; i < m; ++i)
            fnStr = wcln(fns[i], fnStr, td_1);
        ch[id] = { c: wcln(fns[m], fnStr, td_1), e: td_1 };
    }
    var td = mrg({}, ch[id].e);
    return wk(ch[id].c + ';onmessage=function(e){for(var k in e.data)self[k]=e.data[k];onmessage=' + init.toString() + '}', id, td, cbfs(td), cb);
};
// base async inflate fn
var bInflt = function () { return [u8, u16, i32, fleb, fdeb, clim, fl, fd, flrm, fdrm, rev, ec, hMap, max, bits, bits16, shft, slc, err, inflt, inflateSync, pbf, gopt]; };
var bDflt = function () { return [u8, u16, i32, fleb, fdeb, clim, revfl, revfd, flm, flt, fdm, fdt, rev, deo, et, hMap, wbits, wbits16, hTree, ln, lc, clen, wfblk, wblk, shft, slc, dflt, dopt, deflateSync, pbf]; };
// gzip extra
var gze = function () { return [gzh, gzhl, wbytes, crc, crct]; };
// gunzip extra
var guze = function () { return [gzs, gzl]; };
// zlib extra
var zle = function () { return [zlh, wbytes, adler]; };
// unzlib extra
var zule = function () { return [zls]; };
// post buf
var pbf = function (msg) { return postMessage(msg, [msg.buffer]); };
// get opts
var gopt = function (o) { return o && {
    out: o.size && new u8(o.size),
    dictionary: o.dictionary
}; };
// async helper
var cbify = function (dat, opts, fns, init, id, cb) {
    var w = wrkr(fns, init, id, function (err, dat) {
        w.terminate();
        cb(err, dat);
    });
    w.postMessage([dat, opts], opts.consume ? [dat.buffer] : []);
    return function () { w.terminate(); };
};
// auto stream
var astrm = function (strm) {
    strm.ondata = function (dat, final) { return postMessage([dat, final], [dat.buffer]); };
    return function (ev) {
        if (ev.data.length) {
            strm.push(ev.data[0], ev.data[1]);
            postMessage([ev.data[0].length]);
        }
        else
            strm.flush();
    };
};
// async stream attach
var astrmify = function (fns, strm, opts, init, id, flush, ext) {
    var t;
    var w = wrkr(fns, init, id, function (err, dat) {
        if (err)
            w.terminate(), strm.ondata.call(strm, err);
        else if (!Array.isArray(dat))
            ext(dat);
        else if (dat.length == 1) {
            strm.queuedSize -= dat[0];
            if (strm.ondrain)
                strm.ondrain(dat[0]);
        }
        else {
            if (dat[1])
                w.terminate();
            strm.ondata.call(strm, err, dat[0], dat[1]);
        }
    });
    w.postMessage(opts);
    strm.queuedSize = 0;
    strm.push = function (d, f) {
        if (!strm.ondata)
            err(5);
        if (t)
            strm.ondata(err(4, 0, 1), null, !!f);
        strm.queuedSize += d.length;
        w.postMessage([d, t = f], [d.buffer]);
    };
    strm.terminate = function () { w.terminate(); };
    if (flush) {
        strm.flush = function () { w.postMessage([]); };
    }
};
// read 2 bytes
var b2 = function (d, b) { return d[b] | (d[b + 1] << 8); };
// read 4 bytes
var b4 = function (d, b) { return (d[b] | (d[b + 1] << 8) | (d[b + 2] << 16) | (d[b + 3] << 24)) >>> 0; };
var b8 = function (d, b) { return b4(d, b) + (b4(d, b + 4) * 4294967296); };
// write bytes
var wbytes = function (d, b, v) {
    for (; v; ++b)
        d[b] = v, v >>>= 8;
};
// gzip header
var gzh = function (c, o) {
    var fn = o.filename;
    c[0] = 31, c[1] = 139, c[2] = 8, c[8] = o.level < 2 ? 4 : o.level == 9 ? 2 : 0, c[9] = 3; // assume Unix
    if (o.mtime != 0)
        wbytes(c, 4, Math.floor(new Date(o.mtime || Date.now()) / 1000));
    if (fn) {
        c[3] = 8;
        for (var i = 0; i <= fn.length; ++i)
            c[i + 10] = fn.charCodeAt(i);
    }
};
// gzip footer: -8 to -4 = CRC, -4 to -0 is length
// gzip start
var gzs = function (d) {
    if (d[0] != 31 || d[1] != 139 || d[2] != 8)
        err(6, 'invalid gzip data');
    var flg = d[3];
    var st = 10;
    if (flg & 4)
        st += (d[10] | d[11] << 8) + 2;
    for (var zs = (flg >> 3 & 1) + (flg >> 4 & 1); zs > 0; zs -= !d[st++])
        ;
    return st + (flg & 2);
};
// gzip length
var gzl = function (d) {
    var l = d.length;
    return (d[l - 4] | d[l - 3] << 8 | d[l - 2] << 16 | d[l - 1] << 24) >>> 0;
};
// gzip header length
var gzhl = function (o) { return 10 + (o.filename ? o.filename.length + 1 : 0); };
// zlib header
var zlh = function (c, o) {
    var lv = o.level, fl = lv == 0 ? 0 : lv < 6 ? 1 : lv == 9 ? 3 : 2;
    c[0] = 120, c[1] = (fl << 6) | (o.dictionary && 32);
    c[1] |= 31 - ((c[0] << 8) | c[1]) % 31;
    if (o.dictionary) {
        var h = adler();
        h.p(o.dictionary);
        wbytes(c, 2, h.d());
    }
};
// zlib start
var zls = function (d, dict) {
    if ((d[0] & 15) != 8 || (d[0] >> 4) > 7 || ((d[0] << 8 | d[1]) % 31))
        err(6, 'invalid zlib data');
    if ((d[1] >> 5 & 1) == +!dict)
        err(6, 'invalid zlib data: ' + (d[1] & 32 ? 'need' : 'unexpected') + ' dictionary');
    return (d[1] >> 3 & 4) + 2;
};
function StrmOpt(opts, cb) {
    if (typeof opts == 'function')
        cb = opts, opts = {};
    this.ondata = cb;
    return opts;
}
/**
 * Streaming DEFLATE compression
 */
var Deflate = /*#__PURE__*/ (function () {
    function Deflate(opts, cb) {
        if (typeof opts == 'function')
            cb = opts, opts = {};
        this.ondata = cb;
        this.o = opts || {};
        this.s = { l: 0, i: 32768, w: 32768, z: 32768 };
        // Buffer length must always be 0 mod 32768 for index calculations to be correct when modifying head and prev
        // 98304 = 32768 (lookback) + 65536 (common chunk size)
        this.b = new u8(98304);
        if (this.o.dictionary) {
            var dict = this.o.dictionary.subarray(-32768);
            this.b.set(dict, 32768 - dict.length);
            this.s.i = 32768 - dict.length;
        }
    }
    Deflate.prototype.p = function (c, f) {
        this.ondata(dopt(c, this.o, 0, 0, this.s), f);
    };
    /**
     * Pushes a chunk to be deflated
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    Deflate.prototype.push = function (chunk, final) {
        if (!this.ondata)
            err(5);
        if (this.s.l)
            err(4);
        var endLen = chunk.length + this.s.z;
        if (endLen > this.b.length) {
            if (endLen > 2 * this.b.length - 32768) {
                var newBuf = new u8(endLen & -32768);
                newBuf.set(this.b.subarray(0, this.s.z));
                this.b = newBuf;
            }
            var split = this.b.length - this.s.z;
            this.b.set(chunk.subarray(0, split), this.s.z);
            this.s.z = this.b.length;
            this.p(this.b, false);
            this.b.set(this.b.subarray(-32768));
            this.b.set(chunk.subarray(split), 32768);
            this.s.z = chunk.length - split + 32768;
            this.s.i = 32766, this.s.w = 32768;
        }
        else {
            this.b.set(chunk, this.s.z);
            this.s.z += chunk.length;
        }
        this.s.l = final & 1;
        if (this.s.z > this.s.w + 8191 || final) {
            this.p(this.b, final || false);
            this.s.w = this.s.i, this.s.i -= 2;
        }
    };
    /**
     * Flushes buffered uncompressed data. Useful to immediately retrieve the
     * deflated output for small inputs.
     */
    Deflate.prototype.flush = function () {
        if (!this.ondata)
            err(5);
        if (this.s.l)
            err(4);
        this.p(this.b, false);
        this.s.w = this.s.i, this.s.i -= 2;
    };
    return Deflate;
}());

/**
 * Asynchronous streaming DEFLATE compression
 */
var AsyncDeflate = /*#__PURE__*/ (function () {
    function AsyncDeflate(opts, cb) {
        astrmify([
            bDflt,
            function () { return [astrm, Deflate]; }
        ], this, StrmOpt.call(this, opts, cb), function (ev) {
            var strm = new Deflate(ev.data);
            onmessage = astrm(strm);
        }, 6, 1);
    }
    return AsyncDeflate;
}());

function deflate(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    return cbify(data, opts, [
        bDflt,
    ], function (ev) { return pbf(deflateSync(ev.data[0], ev.data[1])); }, 0, cb);
}
/**
 * Compresses data with DEFLATE without any wrapper
 * @param data The data to compress
 * @param opts The compression options
 * @returns The deflated version of the data
 */
function deflateSync(data, opts) {
    return dopt(data, opts || {}, 0, 0);
}
/**
 * Streaming DEFLATE decompression
 */
var Inflate = /*#__PURE__*/ (function () {
    function Inflate(opts, cb) {
        // no StrmOpt here to avoid adding to workerizer
        if (typeof opts == 'function')
            cb = opts, opts = {};
        this.ondata = cb;
        var dict = opts && opts.dictionary && opts.dictionary.subarray(-32768);
        this.s = { i: 0, b: dict ? dict.length : 0 };
        this.o = new u8(32768);
        this.p = new u8(0);
        if (dict)
            this.o.set(dict);
    }
    Inflate.prototype.e = function (c) {
        if (!this.ondata)
            err(5);
        if (this.d)
            err(4);
        if (!this.p.length)
            this.p = c;
        else if (c.length) {
            var n = new u8(this.p.length + c.length);
            n.set(this.p), n.set(c, this.p.length), this.p = n;
        }
    };
    Inflate.prototype.c = function (final) {
        this.s.i = +(this.d = final || false);
        var bts = this.s.b;
        var dt = inflt(this.p, this.s, this.o);
        this.ondata(slc(dt, bts, this.s.b), this.d);
        this.o = slc(dt, this.s.b - 32768), this.s.b = this.o.length;
        this.p = slc(this.p, (this.s.p / 8) | 0), this.s.p &= 7;
    };
    /**
     * Pushes a chunk to be inflated
     * @param chunk The chunk to push
     * @param final Whether this is the final chunk
     */
    Inflate.prototype.push = function (chunk, final) {
        this.e(chunk), this.c(final);
    };
    return Inflate;
}());

/**
 * Asynchronous streaming DEFLATE decompression
 */
var AsyncInflate = /*#__PURE__*/ (function () {
    function AsyncInflate(opts, cb) {
        astrmify([
            bInflt,
            function () { return [astrm, Inflate]; }
        ], this, StrmOpt.call(this, opts, cb), function (ev) {
            var strm = new Inflate(ev.data);
            onmessage = astrm(strm);
        }, 7, 0);
    }
    return AsyncInflate;
}());

function inflate(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    return cbify(data, opts, [
        bInflt
    ], function (ev) { return pbf(inflateSync(ev.data[0], gopt(ev.data[1]))); }, 1, cb);
}
/**
 * Expands DEFLATE data with no wrapper
 * @param data The data to decompress
 * @param opts The decompression options
 * @returns The decompressed version of the data
 */
function inflateSync(data, opts) {
    return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
// before you yell at me for not just using extends, my reason is that TS inheritance is hard to workerize.
/**
 * Streaming GZIP compression
 */
var Gzip = /*#__PURE__*/ (function () {
    function Gzip(opts, cb) {
        this.c = crc();
        this.l = 0;
        this.v = 1;
        Deflate.call(this, opts, cb);
    }
    /**
     * Pushes a chunk to be GZIPped
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    Gzip.prototype.push = function (chunk, final) {
        this.c.p(chunk);
        this.l += chunk.length;
        Deflate.prototype.push.call(this, chunk, final);
    };
    Gzip.prototype.p = function (c, f) {
        var raw = dopt(c, this.o, this.v && gzhl(this.o), f && 8, this.s);
        if (this.v)
            gzh(raw, this.o), this.v = 0;
        if (f)
            wbytes(raw, raw.length - 8, this.c.d()), wbytes(raw, raw.length - 4, this.l);
        this.ondata(raw, f);
    };
    /**
     * Flushes buffered uncompressed data. Useful to immediately retrieve the
     * GZIPped output for small inputs.
     */
    Gzip.prototype.flush = function () {
        Deflate.prototype.flush.call(this);
    };
    return Gzip;
}());

/**
 * Asynchronous streaming GZIP compression
 */
var AsyncGzip = /*#__PURE__*/ (function () {
    function AsyncGzip(opts, cb) {
        astrmify([
            bDflt,
            gze,
            function () { return [astrm, Deflate, Gzip]; }
        ], this, StrmOpt.call(this, opts, cb), function (ev) {
            var strm = new Gzip(ev.data);
            onmessage = astrm(strm);
        }, 8, 1);
    }
    return AsyncGzip;
}());

function gzip(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    return cbify(data, opts, [
        bDflt,
        gze,
        function () { return [gzipSync]; }
    ], function (ev) { return pbf(gzipSync(ev.data[0], ev.data[1])); }, 2, cb);
}
/**
 * Compresses data with GZIP
 * @param data The data to compress
 * @param opts The compression options
 * @returns The gzipped version of the data
 */
function gzipSync(data, opts) {
    if (!opts)
        opts = {};
    var c = crc(), l = data.length;
    c.p(data);
    var d = dopt(data, opts, gzhl(opts), 8), s = d.length;
    return gzh(d, opts), wbytes(d, s - 8, c.d()), wbytes(d, s - 4, l), d;
}
/**
 * Streaming single or multi-member GZIP decompression
 */
var Gunzip = /*#__PURE__*/ (function () {
    function Gunzip(opts, cb) {
        this.v = 1;
        this.r = 0;
        Inflate.call(this, opts, cb);
    }
    /**
     * Pushes a chunk to be GUNZIPped
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    Gunzip.prototype.push = function (chunk, final) {
        Inflate.prototype.e.call(this, chunk);
        this.r += chunk.length;
        if (this.v) {
            var p = this.p.subarray(this.v - 1);
            var s = p.length > 3 ? gzs(p) : 4;
            if (s > p.length) {
                if (!final)
                    return;
            }
            else if (this.v > 1 && this.onmember) {
                this.onmember(this.r - p.length);
            }
            this.p = p.subarray(s), this.v = 0;
        }
        // necessary to prevent TS from using the closure value
        // This allows for workerization to function correctly
        Inflate.prototype.c.call(this, final);
        // process concatenated GZIP
        if (this.s.f && !this.s.l && !final) {
            this.v = shft(this.s.p) + 9;
            this.s = { i: 0 };
            this.o = new u8(0);
            this.push(new u8(0), final);
        }
    };
    return Gunzip;
}());

/**
 * Asynchronous streaming single or multi-member GZIP decompression
 */
var AsyncGunzip = /*#__PURE__*/ (function () {
    function AsyncGunzip(opts, cb) {
        var _this = this;
        astrmify([
            bInflt,
            guze,
            function () { return [astrm, Inflate, Gunzip]; }
        ], this, StrmOpt.call(this, opts, cb), function (ev) {
            var strm = new Gunzip(ev.data);
            strm.onmember = function (offset) { return postMessage(offset); };
            onmessage = astrm(strm);
        }, 9, 0, function (offset) { return _this.onmember && _this.onmember(offset); });
    }
    return AsyncGunzip;
}());

function gunzip(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    return cbify(data, opts, [
        bInflt,
        guze,
        function () { return [gunzipSync]; }
    ], function (ev) { return pbf(gunzipSync(ev.data[0], ev.data[1])); }, 3, cb);
}
/**
 * Expands GZIP data
 * @param data The data to decompress
 * @param opts The decompression options
 * @returns The decompressed version of the data
 */
function gunzipSync(data, opts) {
    var st = gzs(data);
    if (st + 8 > data.length)
        err(6, 'invalid gzip data');
    return inflt(data.subarray(st, -8), { i: 2 }, opts && opts.out || new u8(gzl(data)), opts && opts.dictionary);
}
/**
 * Streaming Zlib compression
 */
var Zlib = /*#__PURE__*/ (function () {
    function Zlib(opts, cb) {
        this.c = adler();
        this.v = 1;
        Deflate.call(this, opts, cb);
    }
    /**
     * Pushes a chunk to be zlibbed
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    Zlib.prototype.push = function (chunk, final) {
        this.c.p(chunk);
        Deflate.prototype.push.call(this, chunk, final);
    };
    Zlib.prototype.p = function (c, f) {
        var raw = dopt(c, this.o, this.v && (this.o.dictionary ? 6 : 2), f && 4, this.s);
        if (this.v)
            zlh(raw, this.o), this.v = 0;
        if (f)
            wbytes(raw, raw.length - 4, this.c.d());
        this.ondata(raw, f);
    };
    /**
     * Flushes buffered uncompressed data. Useful to immediately retrieve the
     * zlibbed output for small inputs.
     */
    Zlib.prototype.flush = function () {
        Deflate.prototype.flush.call(this);
    };
    return Zlib;
}());

/**
 * Asynchronous streaming Zlib compression
 */
var AsyncZlib = /*#__PURE__*/ (function () {
    function AsyncZlib(opts, cb) {
        astrmify([
            bDflt,
            zle,
            function () { return [astrm, Deflate, Zlib]; }
        ], this, StrmOpt.call(this, opts, cb), function (ev) {
            var strm = new Zlib(ev.data);
            onmessage = astrm(strm);
        }, 10, 1);
    }
    return AsyncZlib;
}());

function zlib(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    return cbify(data, opts, [
        bDflt,
        zle,
        function () { return [zlibSync]; }
    ], function (ev) { return pbf(zlibSync(ev.data[0], ev.data[1])); }, 4, cb);
}
/**
 * Compress data with Zlib
 * @param data The data to compress
 * @param opts The compression options
 * @returns The zlib-compressed version of the data
 */
function zlibSync(data, opts) {
    if (!opts)
        opts = {};
    var a = adler();
    a.p(data);
    var d = dopt(data, opts, opts.dictionary ? 6 : 2, 4);
    return zlh(d, opts), wbytes(d, d.length - 4, a.d()), d;
}
/**
 * Streaming Zlib decompression
 */
var Unzlib = /*#__PURE__*/ (function () {
    function Unzlib(opts, cb) {
        Inflate.call(this, opts, cb);
        this.v = opts && opts.dictionary ? 2 : 1;
    }
    /**
     * Pushes a chunk to be unzlibbed
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    Unzlib.prototype.push = function (chunk, final) {
        Inflate.prototype.e.call(this, chunk);
        if (this.v) {
            if (this.p.length < 6 && !final)
                return;
            this.p = this.p.subarray(zls(this.p, this.v - 1)), this.v = 0;
        }
        if (final) {
            if (this.p.length < 4)
                err(6, 'invalid zlib data');
            this.p = this.p.subarray(0, -4);
        }
        // necessary to prevent TS from using the closure value
        // This allows for workerization to function correctly
        Inflate.prototype.c.call(this, final);
    };
    return Unzlib;
}());

/**
 * Asynchronous streaming Zlib decompression
 */
var AsyncUnzlib = /*#__PURE__*/ (function () {
    function AsyncUnzlib(opts, cb) {
        astrmify([
            bInflt,
            zule,
            function () { return [astrm, Inflate, Unzlib]; }
        ], this, StrmOpt.call(this, opts, cb), function (ev) {
            var strm = new Unzlib(ev.data);
            onmessage = astrm(strm);
        }, 11, 0);
    }
    return AsyncUnzlib;
}());

function unzlib(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    return cbify(data, opts, [
        bInflt,
        zule,
        function () { return [unzlibSync]; }
    ], function (ev) { return pbf(unzlibSync(ev.data[0], gopt(ev.data[1]))); }, 5, cb);
}
/**
 * Expands Zlib data
 * @param data The data to decompress
 * @param opts The decompression options
 * @returns The decompressed version of the data
 */
function unzlibSync(data, opts) {
    return inflt(data.subarray(zls(data, opts && opts.dictionary), -4), { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
// Default algorithm for compression (used because having a known output size allows faster decompression)


/**
 * Streaming GZIP, Zlib, or raw DEFLATE decompression
 */
var Decompress = /*#__PURE__*/ (function () {
    function Decompress(opts, cb) {
        this.o = StrmOpt.call(this, opts, cb) || {};
        this.G = Gunzip;
        this.I = Inflate;
        this.Z = Unzlib;
    }
    // init substream
    // overriden by AsyncDecompress
    Decompress.prototype.i = function () {
        var _this = this;
        this.s.ondata = function (dat, final) {
            _this.ondata(dat, final);
        };
    };
    /**
     * Pushes a chunk to be decompressed
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    Decompress.prototype.push = function (chunk, final) {
        if (!this.ondata)
            err(5);
        if (!this.s) {
            if (this.p && this.p.length) {
                var n = new u8(this.p.length + chunk.length);
                n.set(this.p), n.set(chunk, this.p.length);
            }
            else
                this.p = chunk;
            if (this.p.length > 2) {
                this.s = (this.p[0] == 31 && this.p[1] == 139 && this.p[2] == 8)
                    ? new this.G(this.o)
                    : ((this.p[0] & 15) != 8 || (this.p[0] >> 4) > 7 || ((this.p[0] << 8 | this.p[1]) % 31))
                        ? new this.I(this.o)
                        : new this.Z(this.o);
                this.i();
                this.s.push(this.p, final);
                this.p = null;
            }
        }
        else
            this.s.push(chunk, final);
    };
    return Decompress;
}());

/**
 * Asynchronous streaming GZIP, Zlib, or raw DEFLATE decompression
 */
var AsyncDecompress = /*#__PURE__*/ (function () {
    function AsyncDecompress(opts, cb) {
        Decompress.call(this, opts, cb);
        this.queuedSize = 0;
        this.G = AsyncGunzip;
        this.I = AsyncInflate;
        this.Z = AsyncUnzlib;
    }
    AsyncDecompress.prototype.i = function () {
        var _this = this;
        this.s.ondata = function (err, dat, final) {
            _this.ondata(err, dat, final);
        };
        this.s.ondrain = function (size) {
            _this.queuedSize -= size;
            if (_this.ondrain)
                _this.ondrain(size);
        };
    };
    /**
     * Pushes a chunk to be decompressed
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    AsyncDecompress.prototype.push = function (chunk, final) {
        this.queuedSize += chunk.length;
        Decompress.prototype.push.call(this, chunk, final);
    };
    return AsyncDecompress;
}());

function decompress(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    return (data[0] == 31 && data[1] == 139 && data[2] == 8)
        ? gunzip(data, opts, cb)
        : ((data[0] & 15) != 8 || (data[0] >> 4) > 7 || ((data[0] << 8 | data[1]) % 31))
            ? inflate(data, opts, cb)
            : unzlib(data, opts, cb);
}
/**
 * Expands compressed GZIP, Zlib, or raw DEFLATE data, automatically detecting the format
 * @param data The data to decompress
 * @param opts The decompression options
 * @returns The decompressed version of the data
 */
function decompressSync(data, opts) {
    return (data[0] == 31 && data[1] == 139 && data[2] == 8)
        ? gunzipSync(data, opts)
        : ((data[0] & 15) != 8 || (data[0] >> 4) > 7 || ((data[0] << 8 | data[1]) % 31))
            ? inflateSync(data, opts)
            : unzlibSync(data, opts);
}
// flatten a directory structure
var fltn = function (d, p, t, o) {
    for (var k in d) {
        var val = d[k], n = p + k, op = o;
        if (Array.isArray(val))
            op = mrg(o, val[1]), val = val[0];
        if (val instanceof u8)
            t[n] = [val, op];
        else {
            t[n += '/'] = [new u8(0), op];
            fltn(val, n, t, o);
        }
    }
};
// text encoder
var te = typeof TextEncoder != 'undefined' && /*#__PURE__*/ new TextEncoder();
// text decoder
var td = typeof TextDecoder != 'undefined' && /*#__PURE__*/ new TextDecoder();
// text decoder stream
var tds = 0;
try {
    td.decode(et, { stream: true });
    tds = 1;
}
catch (e) { }
// decode UTF8
var dutf8 = function (d) {
    for (var r = '', i = 0;;) {
        var c = d[i++];
        var eb = (c > 127) + (c > 223) + (c > 239);
        if (i + eb > d.length)
            return { s: r, r: slc(d, i - 1) };
        if (!eb)
            r += String.fromCharCode(c);
        else if (eb == 3) {
            c = ((c & 15) << 18 | (d[i++] & 63) << 12 | (d[i++] & 63) << 6 | (d[i++] & 63)) - 65536,
                r += String.fromCharCode(55296 | (c >> 10), 56320 | (c & 1023));
        }
        else if (eb & 1)
            r += String.fromCharCode((c & 31) << 6 | (d[i++] & 63));
        else
            r += String.fromCharCode((c & 15) << 12 | (d[i++] & 63) << 6 | (d[i++] & 63));
    }
};
/**
 * Streaming UTF-8 decoding
 */
var DecodeUTF8 = /*#__PURE__*/ (function () {
    /**
     * Creates a UTF-8 decoding stream
     * @param cb The callback to call whenever data is decoded
     */
    function DecodeUTF8(cb) {
        this.ondata = cb;
        if (tds)
            this.t = new TextDecoder();
        else
            this.p = et;
    }
    /**
     * Pushes a chunk to be decoded from UTF-8 binary
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    DecodeUTF8.prototype.push = function (chunk, final) {
        if (!this.ondata)
            err(5);
        final = !!final;
        if (this.t) {
            this.ondata(this.t.decode(chunk, { stream: true }), final);
            if (final) {
                if (this.t.decode().length)
                    err(8);
                this.t = null;
            }
            return;
        }
        if (!this.p)
            err(4);
        var dat = new u8(this.p.length + chunk.length);
        dat.set(this.p);
        dat.set(chunk, this.p.length);
        var _a = dutf8(dat), s = _a.s, r = _a.r;
        if (final) {
            if (r.length)
                err(8);
            this.p = null;
        }
        else
            this.p = r;
        this.ondata(s, final);
    };
    return DecodeUTF8;
}());

/**
 * Streaming UTF-8 encoding
 */
var EncodeUTF8 = /*#__PURE__*/ (function () {
    /**
     * Creates a UTF-8 decoding stream
     * @param cb The callback to call whenever data is encoded
     */
    function EncodeUTF8(cb) {
        this.ondata = cb;
    }
    /**
     * Pushes a chunk to be encoded to UTF-8
     * @param chunk The string data to push
     * @param final Whether this is the last chunk
     */
    EncodeUTF8.prototype.push = function (chunk, final) {
        if (!this.ondata)
            err(5);
        if (this.d)
            err(4);
        this.ondata(strToU8(chunk), this.d = final || false);
    };
    return EncodeUTF8;
}());

/**
 * Converts a string into a Uint8Array for use with compression/decompression methods
 * @param str The string to encode
 * @param latin1 Whether or not to interpret the data as Latin-1. This should
 *               not need to be true unless decoding a binary string.
 * @returns The string encoded in UTF-8/Latin-1 binary
 */
function strToU8(str, latin1) {
    if (latin1) {
        var ar_1 = new u8(str.length);
        for (var i = 0; i < str.length; ++i)
            ar_1[i] = str.charCodeAt(i);
        return ar_1;
    }
    if (te)
        return te.encode(str);
    var l = str.length;
    var ar = new u8(str.length + (str.length >> 1));
    var ai = 0;
    var w = function (v) { ar[ai++] = v; };
    for (var i = 0; i < l; ++i) {
        if (ai + 5 > ar.length) {
            var n = new u8(ai + 8 + ((l - i) << 1));
            n.set(ar);
            ar = n;
        }
        var c = str.charCodeAt(i);
        if (c < 128 || latin1)
            w(c);
        else if (c < 2048)
            w(192 | (c >> 6)), w(128 | (c & 63));
        else if (c > 55295 && c < 57344)
            c = 65536 + (c & 1023 << 10) | (str.charCodeAt(++i) & 1023),
                w(240 | (c >> 18)), w(128 | ((c >> 12) & 63)), w(128 | ((c >> 6) & 63)), w(128 | (c & 63));
        else
            w(224 | (c >> 12)), w(128 | ((c >> 6) & 63)), w(128 | (c & 63));
    }
    return slc(ar, 0, ai);
}
/**
 * Converts a Uint8Array to a string
 * @param dat The data to decode to string
 * @param latin1 Whether or not to interpret the data as Latin-1. This should
 *               not need to be true unless encoding to binary string.
 * @returns The original UTF-8/Latin-1 string
 */
function strFromU8(dat, latin1) {
    if (latin1) {
        var r = '';
        for (var i = 0; i < dat.length; i += 16384)
            r += String.fromCharCode.apply(null, dat.subarray(i, i + 16384));
        return r;
    }
    else if (td) {
        return td.decode(dat);
    }
    else {
        var _a = dutf8(dat), s = _a.s, r = _a.r;
        if (r.length)
            err(8);
        return s;
    }
}
;
// deflate bit flag
var dbf = function (l) { return l == 1 ? 3 : l < 6 ? 2 : l == 9 ? 1 : 0; };
// skip local zip header
var slzh = function (d, b) { return b + 30 + b2(d, b + 26) + b2(d, b + 28); };
// read zip header
var zh = function (d, b, z) {
    var fnl = b2(d, b + 28), fn = strFromU8(d.subarray(b + 46, b + 46 + fnl), !(b2(d, b + 8) & 2048)), es = b + 46 + fnl, bs = b4(d, b + 20);
    var _a = z && bs == 4294967295 ? z64e(d, es) : [bs, b4(d, b + 24), b4(d, b + 42)], sc = _a[0], su = _a[1], off = _a[2];
    return [b2(d, b + 10), sc, su, fn, es + b2(d, b + 30) + b2(d, b + 32), off];
};
// read zip64 extra field
var z64e = function (d, b) {
    for (; b2(d, b) != 1; b += 4 + b2(d, b + 2))
        ;
    return [b8(d, b + 12), b8(d, b + 4), b8(d, b + 20)];
};
// extra field length
var exfl = function (ex) {
    var le = 0;
    if (ex) {
        for (var k in ex) {
            var l = ex[k].length;
            if (l > 65535)
                err(9);
            le += l + 4;
        }
    }
    return le;
};
// write zip header
var wzh = function (d, b, f, fn, u, c, ce, co) {
    var fl = fn.length, ex = f.extra, col = co && co.length;
    var exl = exfl(ex);
    wbytes(d, b, ce != null ? 0x2014B50 : 0x4034B50), b += 4;
    if (ce != null)
        d[b++] = 20, d[b++] = f.os;
    d[b] = 20, b += 2; // spec compliance? what's that?
    d[b++] = (f.flag << 1) | (c < 0 && 8), d[b++] = u && 8;
    d[b++] = f.compression & 255, d[b++] = f.compression >> 8;
    var dt = new Date(f.mtime == null ? Date.now() : f.mtime), y = dt.getFullYear() - 1980;
    if (y < 0 || y > 119)
        err(10);
    wbytes(d, b, (y << 25) | ((dt.getMonth() + 1) << 21) | (dt.getDate() << 16) | (dt.getHours() << 11) | (dt.getMinutes() << 5) | (dt.getSeconds() >> 1)), b += 4;
    if (c != -1) {
        wbytes(d, b, f.crc);
        wbytes(d, b + 4, c < 0 ? -c - 2 : c);
        wbytes(d, b + 8, f.size);
    }
    wbytes(d, b + 12, fl);
    wbytes(d, b + 14, exl), b += 16;
    if (ce != null) {
        wbytes(d, b, col);
        wbytes(d, b + 6, f.attrs);
        wbytes(d, b + 10, ce), b += 14;
    }
    d.set(fn, b);
    b += fl;
    if (exl) {
        for (var k in ex) {
            var exf = ex[k], l = exf.length;
            wbytes(d, b, +k);
            wbytes(d, b + 2, l);
            d.set(exf, b + 4), b += 4 + l;
        }
    }
    if (col)
        d.set(co, b), b += col;
    return b;
};
// write zip footer (end of central directory)
var wzf = function (o, b, c, d, e) {
    wbytes(o, b, 0x6054B50); // skip disk
    wbytes(o, b + 8, c);
    wbytes(o, b + 10, c);
    wbytes(o, b + 12, d);
    wbytes(o, b + 16, e);
};
/**
 * A pass-through stream to keep data uncompressed in a ZIP archive.
 */
var ZipPassThrough = /*#__PURE__*/ (function () {
    /**
     * Creates a pass-through stream that can be added to ZIP archives
     * @param filename The filename to associate with this data stream
     */
    function ZipPassThrough(filename) {
        this.filename = filename;
        this.c = crc();
        this.size = 0;
        this.compression = 0;
    }
    /**
     * Processes a chunk and pushes to the output stream. You can override this
     * method in a subclass for custom behavior, but by default this passes
     * the data through. You must call this.ondata(err, chunk, final) at some
     * point in this method.
     * @param chunk The chunk to process
     * @param final Whether this is the last chunk
     */
    ZipPassThrough.prototype.process = function (chunk, final) {
        this.ondata(null, chunk, final);
    };
    /**
     * Pushes a chunk to be added. If you are subclassing this with a custom
     * compression algorithm, note that you must push data from the source
     * file only, pre-compression.
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    ZipPassThrough.prototype.push = function (chunk, final) {
        if (!this.ondata)
            err(5);
        this.c.p(chunk);
        this.size += chunk.length;
        if (final)
            this.crc = this.c.d();
        this.process(chunk, final || false);
    };
    return ZipPassThrough;
}());

// I don't extend because TypeScript extension adds 1kB of runtime bloat
/**
 * Streaming DEFLATE compression for ZIP archives. Prefer using AsyncZipDeflate
 * for better performance
 */
var ZipDeflate = /*#__PURE__*/ (function () {
    /**
     * Creates a DEFLATE stream that can be added to ZIP archives
     * @param filename The filename to associate with this data stream
     * @param opts The compression options
     */
    function ZipDeflate(filename, opts) {
        var _this = this;
        if (!opts)
            opts = {};
        ZipPassThrough.call(this, filename);
        this.d = new Deflate(opts, function (dat, final) {
            _this.ondata(null, dat, final);
        });
        this.compression = 8;
        this.flag = dbf(opts.level);
    }
    ZipDeflate.prototype.process = function (chunk, final) {
        try {
            this.d.push(chunk, final);
        }
        catch (e) {
            this.ondata(e, null, final);
        }
    };
    /**
     * Pushes a chunk to be deflated
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    ZipDeflate.prototype.push = function (chunk, final) {
        ZipPassThrough.prototype.push.call(this, chunk, final);
    };
    return ZipDeflate;
}());

/**
 * Asynchronous streaming DEFLATE compression for ZIP archives
 */
var AsyncZipDeflate = /*#__PURE__*/ (function () {
    /**
     * Creates an asynchronous DEFLATE stream that can be added to ZIP archives
     * @param filename The filename to associate with this data stream
     * @param opts The compression options
     */
    function AsyncZipDeflate(filename, opts) {
        var _this = this;
        if (!opts)
            opts = {};
        ZipPassThrough.call(this, filename);
        this.d = new AsyncDeflate(opts, function (err, dat, final) {
            _this.ondata(err, dat, final);
        });
        this.compression = 8;
        this.flag = dbf(opts.level);
        this.terminate = this.d.terminate;
    }
    AsyncZipDeflate.prototype.process = function (chunk, final) {
        this.d.push(chunk, final);
    };
    /**
     * Pushes a chunk to be deflated
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    AsyncZipDeflate.prototype.push = function (chunk, final) {
        ZipPassThrough.prototype.push.call(this, chunk, final);
    };
    return AsyncZipDeflate;
}());

// TODO: Better tree shaking
/**
 * A zippable archive to which files can incrementally be added
 */
var Zip = /*#__PURE__*/ (function () {
    /**
     * Creates an empty ZIP archive to which files can be added
     * @param cb The callback to call whenever data for the generated ZIP archive
     *           is available
     */
    function Zip(cb) {
        this.ondata = cb;
        this.u = [];
        this.d = 1;
    }
    /**
     * Adds a file to the ZIP archive
     * @param file The file stream to add
     */
    Zip.prototype.add = function (file) {
        var _this = this;
        if (!this.ondata)
            err(5);
        // finishing or finished
        if (this.d & 2)
            this.ondata(err(4 + (this.d & 1) * 8, 0, 1), null, false);
        else {
            var f = strToU8(file.filename), fl_1 = f.length;
            var com = file.comment, o = com && strToU8(com);
            var u = fl_1 != file.filename.length || (o && (com.length != o.length));
            var hl_1 = fl_1 + exfl(file.extra) + 30;
            if (fl_1 > 65535)
                this.ondata(err(11, 0, 1), null, false);
            var header = new u8(hl_1);
            wzh(header, 0, file, f, u, -1);
            var chks_1 = [header];
            var pAll_1 = function () {
                for (var _i = 0, chks_2 = chks_1; _i < chks_2.length; _i++) {
                    var chk = chks_2[_i];
                    _this.ondata(null, chk, false);
                }
                chks_1 = [];
            };
            var tr_1 = this.d;
            this.d = 0;
            var ind_1 = this.u.length;
            var uf_1 = mrg(file, {
                f: f,
                u: u,
                o: o,
                t: function () {
                    if (file.terminate)
                        file.terminate();
                },
                r: function () {
                    pAll_1();
                    if (tr_1) {
                        var nxt = _this.u[ind_1 + 1];
                        if (nxt)
                            nxt.r();
                        else
                            _this.d = 1;
                    }
                    tr_1 = 1;
                }
            });
            var cl_1 = 0;
            file.ondata = function (err, dat, final) {
                if (err) {
                    _this.ondata(err, dat, final);
                    _this.terminate();
                }
                else {
                    cl_1 += dat.length;
                    chks_1.push(dat);
                    if (final) {
                        var dd = new u8(16);
                        wbytes(dd, 0, 0x8074B50);
                        wbytes(dd, 4, file.crc);
                        wbytes(dd, 8, cl_1);
                        wbytes(dd, 12, file.size);
                        chks_1.push(dd);
                        uf_1.c = cl_1, uf_1.b = hl_1 + cl_1 + 16, uf_1.crc = file.crc, uf_1.size = file.size;
                        if (tr_1)
                            uf_1.r();
                        tr_1 = 1;
                    }
                    else if (tr_1)
                        pAll_1();
                }
            };
            this.u.push(uf_1);
        }
    };
    /**
     * Ends the process of adding files and prepares to emit the final chunks.
     * This *must* be called after adding all desired files for the resulting
     * ZIP file to work properly.
     */
    Zip.prototype.end = function () {
        var _this = this;
        if (this.d & 2) {
            this.ondata(err(4 + (this.d & 1) * 8, 0, 1), null, true);
            return;
        }
        if (this.d)
            this.e();
        else
            this.u.push({
                r: function () {
                    if (!(_this.d & 1))
                        return;
                    _this.u.splice(-1, 1);
                    _this.e();
                },
                t: function () { }
            });
        this.d = 3;
    };
    Zip.prototype.e = function () {
        var bt = 0, l = 0, tl = 0;
        for (var _i = 0, _a = this.u; _i < _a.length; _i++) {
            var f = _a[_i];
            tl += 46 + f.f.length + exfl(f.extra) + (f.o ? f.o.length : 0);
        }
        var out = new u8(tl + 22);
        for (var _b = 0, _c = this.u; _b < _c.length; _b++) {
            var f = _c[_b];
            wzh(out, bt, f, f.f, f.u, -f.c - 2, l, f.o);
            bt += 46 + f.f.length + exfl(f.extra) + (f.o ? f.o.length : 0), l += f.b;
        }
        wzf(out, bt, this.u.length, tl, l);
        this.ondata(null, out, true);
        this.d = 2;
    };
    /**
     * A method to terminate any internal workers used by the stream. Subsequent
     * calls to add() will fail.
     */
    Zip.prototype.terminate = function () {
        for (var _i = 0, _a = this.u; _i < _a.length; _i++) {
            var f = _a[_i];
            f.t();
        }
        this.d = 2;
    };
    return Zip;
}());

function zip(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    var r = {};
    fltn(data, '', r, opts);
    var k = Object.keys(r);
    var lft = k.length, o = 0, tot = 0;
    var slft = lft, files = new Array(lft);
    var term = [];
    var tAll = function () {
        for (var i = 0; i < term.length; ++i)
            term[i]();
    };
    var cbd = function (a, b) {
        mt(function () { cb(a, b); });
    };
    mt(function () { cbd = cb; });
    var cbf = function () {
        var out = new u8(tot + 22), oe = o, cdl = tot - o;
        tot = 0;
        for (var i = 0; i < slft; ++i) {
            var f = files[i];
            try {
                var l = f.c.length;
                wzh(out, tot, f, f.f, f.u, l);
                var badd = 30 + f.f.length + exfl(f.extra);
                var loc = tot + badd;
                out.set(f.c, loc);
                wzh(out, o, f, f.f, f.u, l, tot, f.m), o += 16 + badd + (f.m ? f.m.length : 0), tot = loc + l;
            }
            catch (e) {
                return cbd(e, null);
            }
        }
        wzf(out, o, files.length, cdl, oe);
        cbd(null, out);
    };
    if (!lft)
        cbf();
    var _loop_1 = function (i) {
        var fn = k[i];
        var _a = r[fn], file = _a[0], p = _a[1];
        var c = crc(), size = file.length;
        c.p(file);
        var f = strToU8(fn), s = f.length;
        var com = p.comment, m = com && strToU8(com), ms = m && m.length;
        var exl = exfl(p.extra);
        var compression = p.level == 0 ? 0 : 8;
        var cbl = function (e, d) {
            if (e) {
                tAll();
                cbd(e, null);
            }
            else {
                var l = d.length;
                files[i] = mrg(p, {
                    size: size,
                    crc: c.d(),
                    c: d,
                    f: f,
                    m: m,
                    u: s != fn.length || (m && (com.length != ms)),
                    compression: compression
                });
                o += 30 + s + exl + l;
                tot += 76 + 2 * (s + exl) + (ms || 0) + l;
                if (!--lft)
                    cbf();
            }
        };
        if (s > 65535)
            cbl(err(11, 0, 1), null);
        if (!compression)
            cbl(null, file);
        else if (size < 160000) {
            try {
                cbl(null, deflateSync(file, p));
            }
            catch (e) {
                cbl(e, null);
            }
        }
        else
            term.push(deflate(file, p, cbl));
    };
    // Cannot use lft because it can decrease
    for (var i = 0; i < slft; ++i) {
        _loop_1(i);
    }
    return tAll;
}
/**
 * Synchronously creates a ZIP file. Prefer using `zip` for better performance
 * with more than one file.
 * @param data The directory structure for the ZIP archive
 * @param opts The main options, merged with per-file options
 * @returns The generated ZIP archive
 */
function zipSync(data, opts) {
    if (!opts)
        opts = {};
    var r = {};
    var files = [];
    fltn(data, '', r, opts);
    var o = 0;
    var tot = 0;
    for (var fn in r) {
        var _a = r[fn], file = _a[0], p = _a[1];
        var compression = p.level == 0 ? 0 : 8;
        var f = strToU8(fn), s = f.length;
        var com = p.comment, m = com && strToU8(com), ms = m && m.length;
        var exl = exfl(p.extra);
        if (s > 65535)
            err(11);
        var d = compression ? deflateSync(file, p) : file, l = d.length;
        var c = crc();
        c.p(file);
        files.push(mrg(p, {
            size: file.length,
            crc: c.d(),
            c: d,
            f: f,
            m: m,
            u: s != fn.length || (m && (com.length != ms)),
            o: o,
            compression: compression
        }));
        o += 30 + s + exl + l;
        tot += 76 + 2 * (s + exl) + (ms || 0) + l;
    }
    var out = new u8(tot + 22), oe = o, cdl = tot - o;
    for (var i = 0; i < files.length; ++i) {
        var f = files[i];
        wzh(out, f.o, f, f.f, f.u, f.c.length);
        var badd = 30 + f.f.length + exfl(f.extra);
        out.set(f.c, f.o + badd);
        wzh(out, o, f, f.f, f.u, f.c.length, f.o, f.m), o += 16 + badd + (f.m ? f.m.length : 0);
    }
    wzf(out, o, files.length, cdl, oe);
    return out;
}
/**
 * Streaming pass-through decompression for ZIP archives
 */
var UnzipPassThrough = /*#__PURE__*/ (function () {
    function UnzipPassThrough() {
    }
    UnzipPassThrough.prototype.push = function (data, final) {
        this.ondata(null, data, final);
    };
    UnzipPassThrough.compression = 0;
    return UnzipPassThrough;
}());

/**
 * Streaming DEFLATE decompression for ZIP archives. Prefer AsyncZipInflate for
 * better performance.
 */
var UnzipInflate = /*#__PURE__*/ (function () {
    /**
     * Creates a DEFLATE decompression that can be used in ZIP archives
     */
    function UnzipInflate() {
        var _this = this;
        this.i = new Inflate(function (dat, final) {
            _this.ondata(null, dat, final);
        });
    }
    UnzipInflate.prototype.push = function (data, final) {
        try {
            this.i.push(data, final);
        }
        catch (e) {
            this.ondata(e, null, final);
        }
    };
    UnzipInflate.compression = 8;
    return UnzipInflate;
}());

/**
 * Asynchronous streaming DEFLATE decompression for ZIP archives
 */
var AsyncUnzipInflate = /*#__PURE__*/ (function () {
    /**
     * Creates a DEFLATE decompression that can be used in ZIP archives
     */
    function AsyncUnzipInflate(_, sz) {
        var _this = this;
        if (sz < 320000) {
            this.i = new Inflate(function (dat, final) {
                _this.ondata(null, dat, final);
            });
        }
        else {
            this.i = new AsyncInflate(function (err, dat, final) {
                _this.ondata(err, dat, final);
            });
            this.terminate = this.i.terminate;
        }
    }
    AsyncUnzipInflate.prototype.push = function (data, final) {
        if (this.i.terminate)
            data = slc(data, 0);
        this.i.push(data, final);
    };
    AsyncUnzipInflate.compression = 8;
    return AsyncUnzipInflate;
}());

/**
 * A ZIP archive decompression stream that emits files as they are discovered
 */
var Unzip = /*#__PURE__*/ (function () {
    /**
     * Creates a ZIP decompression stream
     * @param cb The callback to call whenever a file in the ZIP archive is found
     */
    function Unzip(cb) {
        this.onfile = cb;
        this.k = [];
        this.o = {
            0: UnzipPassThrough
        };
        this.p = et;
    }
    /**
     * Pushes a chunk to be unzipped
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    Unzip.prototype.push = function (chunk, final) {
        var _this = this;
        if (!this.onfile)
            err(5);
        if (!this.p)
            err(4);
        if (this.c > 0) {
            var len = Math.min(this.c, chunk.length);
            var toAdd = chunk.subarray(0, len);
            this.c -= len;
            if (this.d)
                this.d.push(toAdd, !this.c);
            else
                this.k[0].push(toAdd);
            chunk = chunk.subarray(len);
            if (chunk.length)
                return this.push(chunk, final);
        }
        else {
            var f = 0, i = 0, is = void 0, buf = void 0;
            if (!this.p.length)
                buf = chunk;
            else if (!chunk.length)
                buf = this.p;
            else {
                buf = new u8(this.p.length + chunk.length);
                buf.set(this.p), buf.set(chunk, this.p.length);
            }
            var l = buf.length, oc = this.c, add = oc && this.d;
            var _loop_2 = function () {
                var _a;
                var sig = b4(buf, i);
                if (sig == 0x4034B50) {
                    f = 1, is = i;
                    this_1.d = null;
                    this_1.c = 0;
                    var bf = b2(buf, i + 6), cmp_1 = b2(buf, i + 8), u = bf & 2048, dd = bf & 8, fnl = b2(buf, i + 26), es = b2(buf, i + 28);
                    if (l > i + 30 + fnl + es) {
                        var chks_3 = [];
                        this_1.k.unshift(chks_3);
                        f = 2;
                        var sc_1 = b4(buf, i + 18), su_1 = b4(buf, i + 22);
                        var fn_1 = strFromU8(buf.subarray(i + 30, i += 30 + fnl), !u);
                        if (sc_1 == 4294967295) {
                            _a = dd ? [-2] : z64e(buf, i), sc_1 = _a[0], su_1 = _a[1];
                        }
                        else if (dd)
                            sc_1 = -1;
                        i += es;
                        this_1.c = sc_1;
                        var d_1;
                        var file_1 = {
                            name: fn_1,
                            compression: cmp_1,
                            start: function () {
                                if (!file_1.ondata)
                                    err(5);
                                if (!sc_1)
                                    file_1.ondata(null, et, true);
                                else {
                                    var ctr = _this.o[cmp_1];
                                    if (!ctr)
                                        file_1.ondata(err(14, 'unknown compression type ' + cmp_1, 1), null, false);
                                    d_1 = sc_1 < 0 ? new ctr(fn_1) : new ctr(fn_1, sc_1, su_1);
                                    d_1.ondata = function (err, dat, final) { file_1.ondata(err, dat, final); };
                                    for (var _i = 0, chks_4 = chks_3; _i < chks_4.length; _i++) {
                                        var dat = chks_4[_i];
                                        d_1.push(dat, false);
                                    }
                                    if (_this.k[0] == chks_3 && _this.c)
                                        _this.d = d_1;
                                    else
                                        d_1.push(et, true);
                                }
                            },
                            terminate: function () {
                                if (d_1 && d_1.terminate)
                                    d_1.terminate();
                            }
                        };
                        if (sc_1 >= 0)
                            file_1.size = sc_1, file_1.originalSize = su_1;
                        this_1.onfile(file_1);
                    }
                    return "break";
                }
                else if (oc) {
                    if (sig == 0x8074B50) {
                        is = i += 12 + (oc == -2 && 8), f = 3, this_1.c = 0;
                        return "break";
                    }
                    else if (sig == 0x2014B50) {
                        is = i -= 4, f = 3, this_1.c = 0;
                        return "break";
                    }
                }
            };
            var this_1 = this;
            for (; i < l - 4; ++i) {
                var state_1 = _loop_2();
                if (state_1 === "break")
                    break;
            }
            this.p = et;
            if (oc < 0) {
                var dat = f ? buf.subarray(0, is - 12 - (oc == -2 && 8) - (b4(buf, is - 16) == 0x8074B50 && 4)) : buf.subarray(0, i);
                if (add)
                    add.push(dat, !!f);
                else
                    this.k[+(f == 2)].push(dat);
            }
            if (f & 2)
                return this.push(buf.subarray(i), final);
            this.p = buf.subarray(i);
        }
        if (final) {
            if (this.c)
                err(13);
            this.p = null;
        }
    };
    /**
     * Registers a decoder with the stream, allowing for files compressed with
     * the compression type provided to be expanded correctly
     * @param decoder The decoder constructor
     */
    Unzip.prototype.register = function (decoder) {
        this.o[decoder.compression] = decoder;
    };
    return Unzip;
}());

var mt = typeof queueMicrotask == 'function' ? queueMicrotask : typeof setTimeout == 'function' ? setTimeout : function (fn) { fn(); };
function unzip(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    var term = [];
    var tAll = function () {
        for (var i = 0; i < term.length; ++i)
            term[i]();
    };
    var files = {};
    var cbd = function (a, b) {
        mt(function () { cb(a, b); });
    };
    mt(function () { cbd = cb; });
    var e = data.length - 22;
    for (; b4(data, e) != 0x6054B50; --e) {
        if (!e || data.length - e > 65558) {
            cbd(err(13, 0, 1), null);
            return tAll;
        }
    }
    ;
    var lft = b2(data, e + 8);
    if (lft) {
        var c = lft;
        var o = b4(data, e + 16);
        var z = o == 4294967295 || c == 65535;
        if (z) {
            var ze = b4(data, e - 12);
            z = b4(data, ze) == 0x6064B50;
            if (z) {
                c = lft = b4(data, ze + 32);
                o = b4(data, ze + 48);
            }
        }
        var fltr = opts && opts.filter;
        var _loop_3 = function (i) {
            var _a = zh(data, o, z), c_1 = _a[0], sc = _a[1], su = _a[2], fn = _a[3], no = _a[4], off = _a[5], b = slzh(data, off);
            o = no;
            var cbl = function (e, d) {
                if (e) {
                    tAll();
                    cbd(e, null);
                }
                else {
                    if (d)
                        files[fn] = d;
                    if (!--lft)
                        cbd(null, files);
                }
            };
            if (!fltr || fltr({
                name: fn,
                size: sc,
                originalSize: su,
                compression: c_1
            })) {
                if (!c_1)
                    cbl(null, slc(data, b, b + sc));
                else if (c_1 == 8) {
                    var infl = data.subarray(b, b + sc);
                    // Synchronously decompress under 512KB, or barely-compressed data
                    if (su < 524288 || sc > 0.8 * su) {
                        try {
                            cbl(null, inflateSync(infl, { out: new u8(su) }));
                        }
                        catch (e) {
                            cbl(e, null);
                        }
                    }
                    else
                        term.push(inflate(infl, { size: su }, cbl));
                }
                else
                    cbl(err(14, 'unknown compression type ' + c_1, 1), null);
            }
            else
                cbl(null, null);
        };
        for (var i = 0; i < c; ++i) {
            _loop_3(i);
        }
    }
    else
        cbd(null, {});
    return tAll;
}
/**
 * Synchronously decompresses a ZIP archive. Prefer using `unzip` for better
 * performance with more than one file.
 * @param data The raw compressed ZIP file
 * @param opts The ZIP extraction options
 * @returns The decompressed files
 */
function unzipSync(data, opts) {
    var files = {};
    var e = data.length - 22;
    for (; b4(data, e) != 0x6054B50; --e) {
        if (!e || data.length - e > 65558)
            err(13);
    }
    ;
    var c = b2(data, e + 8);
    if (!c)
        return {};
    var o = b4(data, e + 16);
    var z = o == 4294967295 || c == 65535;
    if (z) {
        var ze = b4(data, e - 12);
        z = b4(data, ze) == 0x6064B50;
        if (z) {
            c = b4(data, ze + 32);
            o = b4(data, ze + 48);
        }
    }
    var fltr = opts && opts.filter;
    for (var i = 0; i < c; ++i) {
        var _a = zh(data, o, z), c_2 = _a[0], sc = _a[1], su = _a[2], fn = _a[3], no = _a[4], off = _a[5], b = slzh(data, off);
        o = no;
        if (!fltr || fltr({
            name: fn,
            size: sc,
            originalSize: su,
            compression: c_2
        })) {
            if (!c_2)
                files[fn] = slc(data, b, b + sc);
            else if (c_2 == 8)
                files[fn] = inflateSync(data.subarray(b, b + sc), { out: new u8(su) });
            else
                err(14, 'unknown compression type ' + c_2);
        }
    }
    return files;
}
    
    // Export needed functions to self.fflate
    self.fflate = {
      zipSync: zipSync,
      unzipSync: unzipSync,
      strToU8: strToU8,
      strFromU8: strFromU8,
      deflateSync: deflateSync,
      inflateSync: inflateSync
    };
    console.log('[EspressoMonkey] fflate inlined successfully, functions:', Object.keys(self.fflate).length);
  } catch (e) {
    console.error('[EspressoMonkey] fflate inline error:', e.message, e.stack);
  }
})();
// ============================================================================
// END INLINED fflate
// ============================================================================

// Make fflate available as a variable
var fflate = self.fflate;

// ============================================================================
// INLINED: cloud-sync.js - Cloud Sync Providers
// (inlined to bypass Chrome service worker importScripts caching)
// ============================================================================
var CloudSyncProviders = {
  // ============================================================================
  // WebDAV Provider
  // ============================================================================
  webdav: {
    name: 'WebDAV',
    icon: '☁️',
    requiresAuth: true,
    
    async upload(data, settings) {
      const url = `${settings.webdavUrl.replace(/\/$/, '')}/espressomonkey-backup.json`;
      const auth = btoa(`${settings.webdavUsername}:${settings.webdavPassword}`);
      
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) throw new Error(`WebDAV upload failed: HTTP ${response.status}`);
      return { success: true, timestamp: Date.now() };
    },
    
    async download(settings) {
      const url = `${settings.webdavUrl.replace(/\/$/, '')}/espressomonkey-backup.json`;
      const auth = btoa(`${settings.webdavUsername}:${settings.webdavPassword}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Basic ${auth}` }
      });
      
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`WebDAV download failed: HTTP ${response.status}`);
      
      return await response.json();
    },
    
    async test(settings) {
      try {
        const url = settings.webdavUrl.replace(/\/$/, '');
        const auth = btoa(`${settings.webdavUsername}:${settings.webdavPassword}`);
        
        const response = await fetch(url, {
          method: 'PROPFIND',
          headers: { 'Authorization': `Basic ${auth}`, 'Depth': '0' }
        });
        
        return { success: response.ok || response.status === 207 };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
  },

  // ============================================================================
  // Google Drive Provider
  // ============================================================================
  googledrive: {
    name: 'Google Drive',
    icon: '📁',
    requiresOAuth: true,
    fileName: 'espressomonkey-backup.json',
    
    async getToken(interactive = false) {
      return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive }, (token) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(token);
          }
        });
      });
    },
    
    async revokeToken() {
      try {
        const token = await this.getToken(false);
        if (token) {
          await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
          return new Promise((resolve) => {
            chrome.identity.removeCachedAuthToken({ token }, resolve);
          });
        }
      } catch (e) {
        console.warn('[CloudSync] Google revoke error:', e);
      }
    },
    
    async connect() {
      try {
        const token = await this.getToken(true);
        if (!token) throw new Error('Failed to get authorization token');
        
        // Get user info
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!userResponse.ok) throw new Error('Failed to get user info');
        const user = await userResponse.json();
        
        return {
          success: true,
          user: { email: user.email, name: user.name, picture: user.picture }
        };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
    
    async disconnect() {
      await this.revokeToken();
      return { success: true };
    },
    
    async findFile(token) {
      const query = encodeURIComponent(`name='${this.fileName}' and 'appDataFolder' in parents and trashed=false`);
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime)`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (!response.ok) throw new Error(`Failed to search files: ${response.status}`);
      const data = await response.json();
      return data.files?.[0] || null;
    },
    
    async upload(data, settings) {
      const token = await this.getToken(false);
      if (!token) throw new Error('Not authenticated with Google Drive');
      
      const existingFile = await this.findFile(token);
      const metadata = {
        name: this.fileName,
        mimeType: 'application/json',
        ...(existingFile ? {} : { parents: ['appDataFolder'] })
      };
      
      const boundary = '-------EspressoMonkeyBoundary';
      const body = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify(metadata),
        `--${boundary}`,
        'Content-Type: application/json',
        '',
        JSON.stringify(data),
        `--${boundary}--`
      ].join('\r\n');
      
      const url = existingFile
        ? `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      
      const response = await fetch(url, {
        method: existingFile ? 'PATCH' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Upload failed: ${error}`);
      }
      
      return { success: true, timestamp: Date.now() };
    },
    
    async download(settings) {
      const token = await this.getToken(false);
      if (!token) throw new Error('Not authenticated with Google Drive');
      
      const file = await this.findFile(token);
      if (!file) return null;
      
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      return await response.json();
    },
    
    async test(settings) {
      try {
        const token = await this.getToken(false);
        if (!token) return { success: false, error: 'Not authenticated' };
        
        const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        return { success: response.ok };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
    
    async getStatus() {
      try {
        const token = await this.getToken(false);
        if (!token) return { connected: false };
        
        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) return { connected: false };
        
        const user = await response.json();
        return { connected: true, user: { email: user.email, name: user.name } };
      } catch (e) {
        return { connected: false };
      }
    }
  },

  // ============================================================================
  // Dropbox Provider
  // ============================================================================
  dropbox: {
    name: 'Dropbox',
    icon: '📦',
    requiresOAuth: true,
    fileName: '/espressomonkey-backup.json',
    
    getAuthUrl(clientId, redirectUri) {
      const state = Math.random().toString(36).substring(2);
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'token',
        token_access_type: 'offline',
        state
      });
      return {
        url: `https://www.dropbox.com/oauth2/authorize?${params}`,
        state
      };
    },
    
    async connect(settings) {
      if (!settings.dropboxClientId) {
        throw new Error('Dropbox App Key is required. Create one at https://www.dropbox.com/developers/apps');
      }
      
      const redirectUri = chrome.identity.getRedirectURL('dropbox');
      const { url, state } = this.getAuthUrl(settings.dropboxClientId, redirectUri);
      
      return new Promise((resolve, reject) => {
        chrome.identity.launchWebAuthFlow({ url, interactive: true }, (responseUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          if (!responseUrl) {
            reject(new Error('Authorization was cancelled'));
            return;
          }
          
          try {
            const hash = new URL(responseUrl).hash.substring(1);
            const params = new URLSearchParams(hash);
            const accessToken = params.get('access_token');
            
            if (!accessToken) {
              reject(new Error('No access token received'));
              return;
            }
            
            resolve({ success: true, token: accessToken });
          } catch (e) {
            reject(e);
          }
        });
      });
    },
    
    async disconnect(settings) {
      if (settings.dropboxToken) {
        try {
          await fetch('https://api.dropboxapi.com/2/auth/token/revoke', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${settings.dropboxToken}` }
          });
        } catch (e) {
          console.warn('[CloudSync] Dropbox revoke error:', e);
        }
      }
      return { success: true };
    },
    
    async upload(data, settings) {
      if (!settings.dropboxToken) throw new Error('Not authenticated with Dropbox');
      
      const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.dropboxToken}`,
          'Dropbox-API-Arg': JSON.stringify({
            path: this.fileName,
            mode: 'overwrite',
            autorename: false,
            mute: true
          }),
          'Content-Type': 'application/octet-stream'
        },
        body: JSON.stringify(data)
      });
      
      if (response.status === 401) throw new Error('Dropbox token expired. Please reconnect.');
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Upload failed: ${error}`);
      }
      
      return { success: true, timestamp: Date.now() };
    },
    
    async download(settings) {
      if (!settings.dropboxToken) throw new Error('Not authenticated with Dropbox');
      
      const response = await fetch('https://content.dropboxapi.com/2/files/download', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.dropboxToken}`,
          'Dropbox-API-Arg': JSON.stringify({ path: this.fileName })
        }
      });
      
      if (response.status === 409) return null; // File not found
      if (response.status === 401) throw new Error('Dropbox token expired. Please reconnect.');
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      
      return await response.json();
    },
    
    async test(settings) {
      if (!settings.dropboxToken) return { success: false, error: 'Not authenticated' };
      
      try {
        const response = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${settings.dropboxToken}` }
        });
        
        if (response.status === 401) return { success: false, error: 'Token expired' };
        return { success: response.ok };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
    
    async getStatus(settings) {
      if (!settings.dropboxToken) return { connected: false };
      
      try {
        const response = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${settings.dropboxToken}` }
        });
        
        if (!response.ok) return { connected: false };
        
        const user = await response.json();
        return {
          connected: true,
          user: { email: user.email, name: user.name.display_name }
        };
      } catch (e) {
        return { connected: false };
      }
    }
  }
};

// Export for use in background.js
if (typeof self !== 'undefined') {
  self.CloudSyncProviders = CloudSyncProviders;
}

// ============================================================================
// INLINED: i18n.js - Internationalization Module
// (inlined to bypass Chrome service worker importScripts caching)
// ============================================================================
var I18n = (function() {
  'use strict';

  let currentLocale = 'en';
  
  // All translations
  const translations = {
    en: {
      // General
      appName: 'EspressoMonkey',
      enabled: 'Enabled',
      disabled: 'Disabled',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      close: 'Close',
      confirm: 'Confirm',
      yes: 'Yes',
      no: 'No',
      ok: 'OK',
      error: 'Error',
      success: 'Success',
      warning: 'Warning',
      loading: 'Loading...',
      search: 'Search',
      refresh: 'Refresh',
      
      // Navigation
      tabScripts: 'Installed Userscripts',
      tabSettings: 'Settings',
      tabUtilities: 'Utilities',
      tabHelp: 'Help',
      tabValues: 'Values Editor',
      
      // Scripts
      newScript: 'New Script',
      importScript: 'Import',
      checkUpdates: 'Check Updates',
      searchScripts: 'Search scripts...',
      noScripts: 'No userscripts installed',
      noScriptsDesc: 'Create a new script or import one to get started.',
      scriptName: 'Name',
      scriptVersion: 'Version',
      scriptAuthor: 'Author',
      scriptDescription: 'Description',
      scriptSize: 'Size',
      scriptUpdated: 'Updated',
      scriptEnabled: 'Script Enabled',
      scriptDisabled: 'Script Disabled',
      
      // Editor
      editorCode: 'Code',
      editorInfo: 'Info',
      editorStorage: 'Storage',
      editorSettings: 'Settings',
      editorSave: 'Save',
      editorClose: 'Close',
      editorToggle: 'Toggle',
      editorDuplicate: 'Duplicate',
      editorDelete: 'Delete',
      
      // Settings sections
      settingsGeneral: 'General',
      settingsNotifications: 'Notifications',
      settingsEditor: 'Editor',
      settingsUpdates: 'Updates',
      settingsSync: 'Cloud Sync',
      settingsAdvanced: 'Advanced',
      
      // Sync
      syncProvider: 'Sync Provider',
      syncProviderNone: 'Disabled',
      syncProviderWebdav: 'WebDAV',
      syncProviderGoogleDrive: 'Google Drive',
      syncProviderDropbox: 'Dropbox',
      syncConnected: 'Connected',
      syncDisconnected: 'Not connected',
      syncConnect: 'Connect',
      syncDisconnect: 'Disconnect',
      syncNow: 'Sync Now',
      syncTest: 'Test',
      lastSync: 'Last sync',
      syncSuccess: 'Sync completed successfully',
      syncError: 'Sync failed',
      
      // Values Editor
      valuesTitle: 'Script Values Editor',
      valuesDesc: 'View and edit GM_getValue/GM_setValue storage',
      valuesAllScripts: 'All Scripts',
      valuesNoData: 'No stored values found',
      valuesKey: 'Key',
      valuesValue: 'Value',
      valuesType: 'Type',
      valuesScript: 'Script',
      valuesAdd: 'Add Value',
      valuesEdit: 'Edit Value',
      valuesDelete: 'Delete',
      valuesDeleteSelected: 'Delete Selected',
      valuesSaved: 'Value saved',
      valuesDeleted: 'Value deleted',
      
      // Per-script settings
      scriptSettingsTitle: 'Per-Script Settings',
      scriptAutoUpdate: 'Auto-update this script',
      scriptNotifyUpdates: 'Notify on updates',
      scriptNotifyErrors: 'Notify on errors',
      scriptRunAt: 'Run at',
      scriptInjectInto: 'Inject into',
      scriptExcludes: 'Additional excludes',
      runAtDefault: 'Default (from metadata)',
      runAtDocumentStart: 'Document Start',
      runAtDocumentEnd: 'Document End',
      runAtDocumentIdle: 'Document Idle',
      injectAuto: 'Auto',
      injectPage: 'Page Context',
      injectContent: 'Content Script',
      
      // Utilities
      exportAll: 'Export All',
      exportZip: 'Export as ZIP',
      importFile: 'Import from File',
      importUrl: 'Import from URL',
      importText: 'Import from Text',
      chooseFile: 'Choose File',
      noFileSelected: 'No file selected',
      
      // Messages
      scriptInstalled: 'Script installed',
      scriptUpdated: 'Script updated',
      scriptDeleted: 'Script deleted',
      settingsSaved: 'Settings saved',
      confirmDelete: 'Are you sure you want to delete this script?',
      confirmDeleteMultiple: 'Delete {count} selected scripts?',
      updateAvailable: 'Update available',
      noUpdates: 'All scripts are up to date'
    },
    
    es: {
      appName: 'EspressoMonkey',
      enabled: 'Activado',
      disabled: 'Desactivado',
      save: 'Guardar',
      cancel: 'Cancelar',
      delete: 'Eliminar',
      edit: 'Editar',
      close: 'Cerrar',
      confirm: 'Confirmar',
      yes: 'Sí',
      no: 'No',
      ok: 'OK',
      error: 'Error',
      success: 'Éxito',
      warning: 'Advertencia',
      loading: 'Cargando...',
      search: 'Buscar',
      refresh: 'Actualizar',
      tabScripts: 'Scripts Instalados',
      tabSettings: 'Configuración',
      tabUtilities: 'Utilidades',
      tabHelp: 'Ayuda',
      tabValues: 'Editor de Valores',
      newScript: 'Nuevo Script',
      importScript: 'Importar',
      checkUpdates: 'Buscar Actualizaciones',
      searchScripts: 'Buscar scripts...',
      noScripts: 'No hay scripts instalados',
      noScriptsDesc: 'Crea un nuevo script o importa uno para comenzar.',
      syncProvider: 'Proveedor de Sincronización',
      syncProviderNone: 'Desactivado',
      syncConnect: 'Conectar',
      syncDisconnect: 'Desconectar',
      syncNow: 'Sincronizar Ahora',
      lastSync: 'Última sincronización',
      valuesTitle: 'Editor de Valores',
      valuesAllScripts: 'Todos los Scripts',
      valuesNoData: 'No se encontraron valores almacenados'
    },
    
    fr: {
      appName: 'EspressoMonkey',
      enabled: 'Activé',
      disabled: 'Désactivé',
      save: 'Enregistrer',
      cancel: 'Annuler',
      delete: 'Supprimer',
      edit: 'Modifier',
      close: 'Fermer',
      confirm: 'Confirmer',
      yes: 'Oui',
      no: 'Non',
      ok: 'OK',
      error: 'Erreur',
      success: 'Succès',
      warning: 'Avertissement',
      loading: 'Chargement...',
      search: 'Rechercher',
      refresh: 'Actualiser',
      tabScripts: 'Scripts Installés',
      tabSettings: 'Paramètres',
      tabUtilities: 'Utilitaires',
      tabHelp: 'Aide',
      tabValues: 'Éditeur de Valeurs',
      newScript: 'Nouveau Script',
      importScript: 'Importer',
      checkUpdates: 'Vérifier les Mises à Jour',
      searchScripts: 'Rechercher des scripts...',
      noScripts: 'Aucun script installé',
      syncProvider: 'Fournisseur de Synchronisation',
      syncProviderNone: 'Désactivé',
      syncConnect: 'Connecter',
      syncDisconnect: 'Déconnecter',
      syncNow: 'Synchroniser',
      lastSync: 'Dernière synchronisation'
    },
    
    de: {
      appName: 'EspressoMonkey',
      enabled: 'Aktiviert',
      disabled: 'Deaktiviert',
      save: 'Speichern',
      cancel: 'Abbrechen',
      delete: 'Löschen',
      edit: 'Bearbeiten',
      close: 'Schließen',
      confirm: 'Bestätigen',
      yes: 'Ja',
      no: 'Nein',
      ok: 'OK',
      error: 'Fehler',
      success: 'Erfolg',
      warning: 'Warnung',
      loading: 'Laden...',
      search: 'Suchen',
      refresh: 'Aktualisieren',
      tabScripts: 'Installierte Scripts',
      tabSettings: 'Einstellungen',
      tabUtilities: 'Werkzeuge',
      tabHelp: 'Hilfe',
      tabValues: 'Werte-Editor',
      newScript: 'Neues Script',
      importScript: 'Importieren',
      checkUpdates: 'Updates prüfen',
      searchScripts: 'Scripts suchen...',
      noScripts: 'Keine Scripts installiert',
      syncProvider: 'Sync-Anbieter',
      syncProviderNone: 'Deaktiviert',
      syncConnect: 'Verbinden',
      syncDisconnect: 'Trennen',
      syncNow: 'Jetzt synchronisieren',
      lastSync: 'Letzte Synchronisation'
    },
    
    zh: {
      appName: 'EspressoMonkey',
      enabled: '已启用',
      disabled: '已禁用',
      save: '保存',
      cancel: '取消',
      delete: '删除',
      edit: '编辑',
      close: '关闭',
      confirm: '确认',
      yes: '是',
      no: '否',
      ok: '确定',
      error: '错误',
      success: '成功',
      warning: '警告',
      loading: '加载中...',
      search: '搜索',
      refresh: '刷新',
      tabScripts: '已安装脚本',
      tabSettings: '设置',
      tabUtilities: '工具',
      tabHelp: '帮助',
      tabValues: '值编辑器',
      newScript: '新建脚本',
      importScript: '导入',
      checkUpdates: '检查更新',
      searchScripts: '搜索脚本...',
      noScripts: '没有安装脚本',
      syncProvider: '同步服务',
      syncProviderNone: '禁用',
      syncConnect: '连接',
      syncDisconnect: '断开',
      syncNow: '立即同步',
      lastSync: '上次同步'
    },
    
    ja: {
      appName: 'EspressoMonkey',
      enabled: '有効',
      disabled: '無効',
      save: '保存',
      cancel: 'キャンセル',
      delete: '削除',
      edit: '編集',
      close: '閉じる',
      confirm: '確認',
      yes: 'はい',
      no: 'いいえ',
      ok: 'OK',
      error: 'エラー',
      success: '成功',
      warning: '警告',
      loading: '読み込み中...',
      search: '検索',
      refresh: '更新',
      tabScripts: 'インストール済みスクリプト',
      tabSettings: '設定',
      tabUtilities: 'ユーティリティ',
      tabHelp: 'ヘルプ',
      tabValues: '値エディタ',
      newScript: '新規スクリプト',
      importScript: 'インポート',
      checkUpdates: '更新を確認',
      searchScripts: 'スクリプトを検索...',
      noScripts: 'スクリプトがインストールされていません',
      syncProvider: '同期プロバイダー',
      syncProviderNone: '無効',
      syncConnect: '接続',
      syncDisconnect: '切断',
      syncNow: '今すぐ同期',
      lastSync: '最終同期'
    },
    
    pt: {
      appName: 'EspressoMonkey',
      enabled: 'Ativado',
      disabled: 'Desativado',
      save: 'Salvar',
      cancel: 'Cancelar',
      delete: 'Excluir',
      edit: 'Editar',
      close: 'Fechar',
      confirm: 'Confirmar',
      yes: 'Sim',
      no: 'Não',
      ok: 'OK',
      error: 'Erro',
      success: 'Sucesso',
      warning: 'Aviso',
      loading: 'Carregando...',
      search: 'Pesquisar',
      refresh: 'Atualizar',
      tabScripts: 'Scripts Instalados',
      tabSettings: 'Configurações',
      tabUtilities: 'Utilitários',
      tabHelp: 'Ajuda',
      tabValues: 'Editor de Valores',
      newScript: 'Novo Script',
      importScript: 'Importar',
      checkUpdates: 'Verificar Atualizações',
      searchScripts: 'Pesquisar scripts...',
      noScripts: 'Nenhum script instalado',
      syncProvider: 'Provedor de Sincronização',
      syncProviderNone: 'Desativado',
      syncConnect: 'Conectar',
      syncDisconnect: 'Desconectar',
      syncNow: 'Sincronizar Agora',
      lastSync: 'Última sincronização'
    },
    
    ru: {
      appName: 'EspressoMonkey',
      enabled: 'Включено',
      disabled: 'Отключено',
      save: 'Сохранить',
      cancel: 'Отмена',
      delete: 'Удалить',
      edit: 'Редактировать',
      close: 'Закрыть',
      confirm: 'Подтвердить',
      yes: 'Да',
      no: 'Нет',
      ok: 'OK',
      error: 'Ошибка',
      success: 'Успешно',
      warning: 'Предупреждение',
      loading: 'Загрузка...',
      search: 'Поиск',
      refresh: 'Обновить',
      tabScripts: 'Установленные скрипты',
      tabSettings: 'Настройки',
      tabUtilities: 'Утилиты',
      tabHelp: 'Помощь',
      tabValues: 'Редактор значений',
      newScript: 'Новый скрипт',
      importScript: 'Импорт',
      checkUpdates: 'Проверить обновления',
      searchScripts: 'Поиск скриптов...',
      noScripts: 'Нет установленных скриптов',
      syncProvider: 'Провайдер синхронизации',
      syncProviderNone: 'Отключено',
      syncConnect: 'Подключить',
      syncDisconnect: 'Отключить',
      syncNow: 'Синхронизировать',
      lastSync: 'Последняя синхронизация'
    }
  };

  // Detect browser language
  function detectLocale() {
    const browserLang = navigator.language || navigator.userLanguage || 'en';
    const shortLang = browserLang.split('-')[0].toLowerCase();
    return translations[shortLang] ? shortLang : 'en';
  }

  // Get message with optional placeholder substitution
  function getMessage(key, placeholders = {}) {
    const locale = translations[currentLocale] || translations.en;
    let message = locale[key] || translations.en[key] || key;
    
    // Replace placeholders like {count}, {name}, etc.
    Object.keys(placeholders).forEach(placeholder => {
      message = message.replace(new RegExp(`\{${placeholder}\}`, 'g'), placeholders[placeholder]);
    });
    
    return message;
  }

  return {
    init(locale) {
      currentLocale = locale === 'auto' ? detectLocale() : (translations[locale] ? locale : 'en');
      console.log('[I18n] Initialized with locale:', currentLocale);
      return currentLocale;
    },
    
    setLocale(locale) {
      if (translations[locale]) {
        currentLocale = locale;
        return true;
      }
      return false;
    },
    
    getLocale() {
      return currentLocale;
    },
    
    getMessage,
    t: getMessage, // Shorthand alias
    
    getAvailableLocales() {
      return Object.keys(translations).map(code => ({
        code,
        name: {
          en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch',
          zh: '中文', ja: '日本語', pt: 'Português', ru: 'Русский'
        }[code] || code
      }));
    },
    
    // Apply translations to DOM elements with data-i18n attribute
    applyToDOM(container = document) {
      container.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = getMessage(key);
      });
      container.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = getMessage(key);
      });
      container.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        el.title = getMessage(key);
      });
    }
  };
})();

// Export for use in pages
if (typeof window !== 'undefined') {
  window.I18n = I18n;
}
if (typeof self !== 'undefined') {
  self.I18n = I18n;
}

// ============================================================================
// END INLINED MODULES
// ============================================================================

console.log('[EspressoMonkey] Service worker starting...');


// ============================================================================
// Settings Manager
// ============================================================================

const SettingsManager = {
  defaults: {
    // General
    enabled: true,
    showBadge: true,
    badgeColor: '#22c55e',
    theme: 'dark',
    
    // Notifications
    notifyOnInstall: true,
    notifyOnUpdate: true,
    notifyOnError: false,
    
    // Editor
    editorTheme: 'material-darker',
    editorFontSize: 13,
    editorTabSize: 2,
    editorLineWrapping: false,
    editorAutoComplete: true,
    editorMatchBrackets: true,
    editorAutoCloseBrackets: true,
    editorHighlightActiveLine: true,
    editorShowInvisibles: false,
    editorKeyMap: 'default',
    
    // Updates
    autoUpdate: true,
    updateInterval: 86400000, // 24 hours
    lastUpdateCheck: 0,
    
    // Sync
    syncEnabled: false,
    syncProvider: 'none',
    syncInterval: 3600000, // 1 hour
    lastSync: 0,
    webdavUrl: '',
    webdavUsername: '',
    webdavPassword: '',
    // Google Drive (uses chrome.identity)
    googleDriveConnected: false,
    googleDriveUser: null,
    // Dropbox
    dropboxToken: '',
    dropboxUser: null,
    dropboxClientId: '',
    // Language
    language: 'auto',
    
    // Advanced
    debugMode: false,
    injectIntoFrames: true,
    xhrTimeout: 30000,
    
    // Global Blacklist
    blacklist: []
  },
  
  cache: null,
  
  async init() {
    if (this.cache !== null) return;
    const data = await chrome.storage.local.get('settings');
    this.cache = { ...this.defaults, ...data.settings };
    console.log('[EspressoMonkey] Settings loaded');
  },
  
  async get(key) {
    await this.init();
    return key ? this.cache[key] : { ...this.cache };
  },
  
  async set(key, value) {
    await this.init();
    if (typeof key === 'object') {
      this.cache = { ...this.cache, ...key };
    } else {
      this.cache[key] = value;
    }
    await chrome.storage.local.set({ settings: this.cache });
    return this.cache;
  },
  
  async reset() {
    this.cache = { ...this.defaults };
    await chrome.storage.local.set({ settings: this.cache });
    return this.cache;
  }
};

// ============================================================================
// Script Storage
// ============================================================================

const ScriptStorage = {
  cache: null,
  
  async init() {
    if (this.cache !== null) return;
    const data = await chrome.storage.local.get('userscripts');
    this.cache = data.userscripts || {};
    console.log('[EspressoMonkey] Loaded', Object.keys(this.cache).length, 'scripts');
  },
  
  async save() {
    await chrome.storage.local.set({ userscripts: this.cache });
  },
  
  async getAll() {
    await this.init();
    return Object.values(this.cache);
  },
  
  async get(id) {
    await this.init();
    return this.cache[id] || null;
  },
  
  async set(id, script) {
    await this.init();
    this.cache[id] = script;
    await this.save();
    return script;
  },
  
  async delete(id) {
    await this.init();
    delete this.cache[id];
    // Also delete associated values
    await ScriptValues.deleteAll(id);
    await this.save();
  },
  
  async clear() {
    this.cache = {};
    await this.save();
  },
  
  async search(query) {
    await this.init();
    const q = query.toLowerCase();
    return Object.values(this.cache).filter(s => 
      s.meta.name.toLowerCase().includes(q) ||
      s.meta.description?.toLowerCase().includes(q) ||
      s.meta.author?.toLowerCase().includes(q)
    );
  },
  
  async getByNamespace(namespace) {
    await this.init();
    return Object.values(this.cache).filter(s => s.meta.namespace === namespace);
  },
  
  async reorder(orderedIds) {
    await this.init();
    orderedIds.forEach((id, index) => {
      if (this.cache[id]) {
        this.cache[id].position = index;
      }
    });
    await this.save();
  },
  
  async duplicate(id) {
    await this.init();
    const original = this.cache[id];
    if (!original) return null;
    
    const newId = generateId();
    const newScript = {
      ...JSON.parse(JSON.stringify(original)),
      id: newId,
      meta: {
        ...original.meta,
        name: original.meta.name + ' (Copy)'
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    this.cache[newId] = newScript;
    await this.save();
    return newScript;
  }
};

// ============================================================================
// Script Values Storage (GM_getValue/setValue)
// ============================================================================

const ScriptValues = {
  cache: {},
  listeners: new Map(),
  pendingNotifications: new Map(), // Debounce notifications only (not saves!)
  
  async init(scriptId) {
    if (this.cache[scriptId]) return;
    const data = await chrome.storage.local.get(`values_${scriptId}`);
    this.cache[scriptId] = data[`values_${scriptId}`] || {};
  },
  
  async get(scriptId, key, defaultValue) {
    await this.init(scriptId);
    const value = this.cache[scriptId][key];
    return value !== undefined ? value : defaultValue;
  },
  
  // FIXED: Save immediately to prevent data loss on service worker termination
  // MV3 service workers can be killed at any time - setTimeout-based debouncing is unsafe
  async set(scriptId, key, value) {
    await this.init(scriptId);
    const oldValue = this.cache[scriptId][key];
    
    // Update cache immediately
    this.cache[scriptId][key] = value;
    
    // Save IMMEDIATELY - don't debounce persistence in MV3!
    // Service workers can be terminated at any time, losing unsaved data
    await chrome.storage.local.set({ 
      [`values_${scriptId}`]: this.cache[scriptId] 
    });
    
    // Debounce notifications only (these are less critical)
    this.scheduleNotification(scriptId, key, oldValue, value);
    
    return value;
  },
  
  // Debounced notifications - batches rapid changes (notification loss is acceptable)
  scheduleNotification(scriptId, key, oldValue, newValue) {
    const notifKey = `${scriptId}_${key}`;
    const existing = this.pendingNotifications.get(notifKey);
    if (existing) {
      clearTimeout(existing.timeout);
      // Keep original oldValue for batched notification
      oldValue = existing.oldValue;
    }
    
    const timeout = setTimeout(() => {
      this.pendingNotifications.delete(notifKey);
      this.notifyChange(scriptId, key, oldValue, newValue, false);
    }, 100);
    
    this.pendingNotifications.set(notifKey, { timeout, oldValue });
  },
  
  async delete(scriptId, key) {
    await this.init(scriptId);
    const oldValue = this.cache[scriptId][key];
    delete this.cache[scriptId][key];
    // Save immediately
    await chrome.storage.local.set({ 
      [`values_${scriptId}`]: this.cache[scriptId] 
    });
    this.scheduleNotification(scriptId, key, oldValue, undefined);
  },
  
  async list(scriptId) {
    await this.init(scriptId);
    return Object.keys(this.cache[scriptId]);
  },
  
  async getAll(scriptId) {
    await this.init(scriptId);
    return { ...this.cache[scriptId] };
  },
  
  async setAll(scriptId, values) {
    await this.init(scriptId);
    for (const [key, value] of Object.entries(values)) {
      const oldValue = this.cache[scriptId][key];
      this.cache[scriptId][key] = value;
      this.scheduleNotification(scriptId, key, oldValue, value);
    }
    // Save immediately
    await chrome.storage.local.set({ 
      [`values_${scriptId}`]: this.cache[scriptId] 
    });
  },
  
  async deleteAll(scriptId) {
    delete this.cache[scriptId];
    await chrome.storage.local.remove(`values_${scriptId}`);
  },
  
  // Delete multiple specific keys at once
  async deleteMultiple(scriptId, keys) {
    await this.init(scriptId);
    for (const key of keys) {
      const oldValue = this.cache[scriptId][key];
      delete this.cache[scriptId][key];
      this.scheduleNotification(scriptId, key, oldValue, undefined);
    }
    // Save immediately
    await chrome.storage.local.set({ 
      [`values_${scriptId}`]: this.cache[scriptId] 
    });
  },
  
  async getStorageSize(scriptId) {
    await this.init(scriptId);
    return JSON.stringify(this.cache[scriptId] || {}).length;
  },
  
  addListener(scriptId, listenerId, callback) {
    const key = `${scriptId}_${listenerId}`;
    this.listeners.set(key, { scriptId, callback });
    return key;
  },
  
  removeListener(key) {
    this.listeners.delete(key);
  },
  
  notifyChange(scriptId, key, oldValue, newValue, remote) {
    // Skip if value didn't actually change
    if (oldValue === newValue) return;
    
    // Notify local listeners
    this.listeners.forEach((listener) => {
      if (listener.scriptId === scriptId) {
        try {
          listener.callback(key, oldValue, newValue, remote);
        } catch (e) {
          console.error('[EspressoMonkey] Value change listener error:', e);
        }
      }
    });
    
    // OPTIMIZED: Only broadcast to other tabs (not all tabs)
    // Use a more efficient approach - broadcast to active tabs only
    chrome.tabs.query({ active: true }, (activeTabs) => {
      // Also get tabs that might be running scripts
      chrome.tabs.query({ status: 'complete' }, (allTabs) => {
        // Deduplicate and limit to 20 tabs max for performance
        const tabIds = new Set();
        activeTabs.forEach(t => tabIds.add(t.id));
        allTabs.slice(0, 20).forEach(t => tabIds.add(t.id));
        
        tabIds.forEach(tabId => {
          chrome.tabs.sendMessage(tabId, {
            action: 'valueChanged',
            data: { scriptId, key, oldValue, newValue, remote: true }
          }).catch(() => {}); // Ignore errors for tabs without content script
        });
      });
    });
  }
};

// ============================================================================
// Tab Storage (GM_getTab/saveTab)
// ============================================================================

const TabStorage = {
  data: new Map(),
  
  get(tabId) {
    return this.data.get(tabId) || {};
  },
  
  set(tabId, data) {
    this.data.set(tabId, data);
  },
  
  delete(tabId) {
    this.data.delete(tabId);
  },
  
  getAll() {
    const result = {};
    this.data.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
};

// Clean up tab data when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  TabStorage.delete(tabId);
  // Also abort any pending XHR requests for this tab
  XhrManager.abortByTab(tabId);
});

// ============================================================================
// XHR Request Manager (tracks requests for abort support)
// ============================================================================

const XhrManager = {
  requests: new Map(), // requestId -> { controller, tabId, scriptId, etc }
  nextId: 1,
  
  // Create a new tracked request (controller added later by caller)
  create(tabId, scriptId, details) {
    const requestId = `xhr_${this.nextId++}_${Date.now()}`;
    
    const request = {
      id: requestId,
      controller: null, // AbortController added by caller
      tabId,
      scriptId,
      details,
      aborted: false,
      startTime: Date.now()
    };
    
    this.requests.set(requestId, request);
    return request;
  },
  
  // Get a request by ID
  get(requestId) {
    return this.requests.get(requestId);
  },
  
  // Abort a specific request
  abort(requestId) {
    const request = this.requests.get(requestId);
    if (request && !request.aborted) {
      request.aborted = true;
      if (request.controller) {
        try {
          request.controller.abort();
        } catch (e) {
          // Ignore abort errors
        }
      }
      return true;
    }
    return false;
  },
  
  // Remove a completed/aborted request
  remove(requestId) {
    this.requests.delete(requestId);
  },
  
  // Abort all requests for a tab
  abortByTab(tabId) {
    for (const [requestId, request] of this.requests) {
      if (request.tabId === tabId) {
        this.abort(requestId);
        this.remove(requestId);
      }
    }
  },
  
  // Abort all requests for a script
  abortByScript(scriptId) {
    for (const [requestId, request] of this.requests) {
      if (request.scriptId === scriptId) {
        this.abort(requestId);
        this.remove(requestId);
      }
    }
  },
  
  // Get count of active requests
  getActiveCount() {
    return this.requests.size;
  }
};

// ============================================================================
// Resource Cache
// ============================================================================

const ResourceCache = {
  cache: {},
  maxAge: 86400000, // 24 hours
  
  async get(url) {
    const cached = this.cache[url];
    if (cached && Date.now() - cached.timestamp < this.maxAge) {
      return cached.data;
    }
    return null;
  },
  
  set(url, data) {
    this.cache[url] = { data, timestamp: Date.now() };
  },
  
  async fetch(url) {
    const cached = await this.get(url);
    if (cached) return cached;
    
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.text();
      this.set(url, data);
      return data;
    } catch (e) {
      console.error('[EspressoMonkey] Failed to fetch resource:', url, e);
      throw e;
    }
  },
  
  clear() {
    this.cache = {};
  }
};

// ============================================================================
// Userscript Parser
// ============================================================================

function parseUserscript(code) {
  const metaBlockMatch = code.match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/);
  if (!metaBlockMatch) {
    return { error: 'No metadata block found. Scripts must include ==UserScript== header.' };
  }

  const meta = {
    name: 'Unnamed Script',
    namespace: 'espressomonkey',
    version: '1.0.0',
    description: '',
    author: '',
    match: [],
    include: [],
    exclude: [],
    excludeMatch: [],
    grant: [],
    require: [],
    resource: {},
    'run-at': 'document-idle',
    noframes: false,
    icon: '',
    icon64: '',
    homepage: '',
    homepageURL: '',
    website: '',
    source: '',
    updateURL: '',
    downloadURL: '',
    supportURL: '',
    connect: [],
    antifeature: [],
    unwrap: false,
    'inject-into': 'auto',
    sandbox: ''
  };

  const metaBlock = metaBlockMatch[1];
  const lines = metaBlock.split('\n');

  for (const line of lines) {
    const match = line.match(/\/\/\s*@(\S+)(?:\s+(.*))?/);
    if (!match) continue;

    const key = match[1].trim();
    const value = (match[2] || '').trim();

    switch (key) {
      case 'name':
      case 'namespace':
      case 'version':
      case 'description':
      case 'author':
      case 'icon':
      case 'icon64':
      case 'homepage':
      case 'homepageURL':
      case 'website':
      case 'source':
      case 'updateURL':
      case 'downloadURL':
      case 'supportURL':
      case 'run-at':
      case 'inject-into':
      case 'sandbox':
        meta[key] = value;
        break;
      case 'match':
      case 'include':
      case 'exclude':
      case 'exclude-match':
      case 'excludeMatch':
      case 'grant':
      case 'require':
      case 'connect':
      case 'antifeature':
        const arrayKey = key === 'exclude-match' ? 'excludeMatch' : key;
        if (!meta[arrayKey]) meta[arrayKey] = [];
        if (value) meta[arrayKey].push(value);
        break;
      case 'resource':
        const resourceMatch = value.match(/^(\S+)\s+(.+)$/);
        if (resourceMatch) {
          meta.resource[resourceMatch[1]] = resourceMatch[2];
        }
        break;
      case 'noframes':
        meta.noframes = true;
        break;
      case 'unwrap':
        meta.unwrap = true;
        break;
      default:
        // Handle localized metadata like @name:ja
        if (key.includes(':')) {
          const [baseKey, locale] = key.split(':');
          if (!meta.localized) meta.localized = {};
          if (!meta.localized[locale]) meta.localized[locale] = {};
          meta.localized[locale][baseKey] = value;
        }
    }
  }

  // Default grant if none specified
  if (meta.grant.length === 0) {
    meta.grant = ['none'];
  }

  return { meta, code, metaBlock: metaBlockMatch[0] };
}

// ============================================================================
// URL Matching
// ============================================================================

function matchPattern(pattern, url) {
  if (pattern === '<all_urls>') return true;
  if (pattern === '*') return true;
  
  try {
    // Handle glob patterns
    if (pattern.includes('*') && !pattern.startsWith('*://')) {
      // Convert glob to regex
      const regexPattern = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      return new RegExp(`^${regexPattern}$`).test(url);
    }
    
    // Handle standard match patterns
    const patternRegex = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    
    return new RegExp(`^${patternRegex}$`).test(url);
  } catch (e) {
    return false;
  }
}

function shouldRunScript(script, url, isFrame) {
  const meta = script.meta;
  
  // Check noframes
  if (isFrame && meta.noframes) return false;
  
  // Check blacklist
  const settings = SettingsManager.cache || {};
  if (settings.blacklist?.some(pattern => matchPattern(pattern, url))) {
    return false;
  }
  
  // Check exclude patterns
  const excludes = [...(meta.exclude || []), ...(meta.excludeMatch || [])];
  if (excludes.some(pattern => matchPattern(pattern, url))) {
    return false;
  }
  
  // Check include/match patterns
  const includes = [...(meta.match || []), ...(meta.include || [])];
  if (includes.length === 0) return false;
  
  return includes.some(pattern => matchPattern(pattern, url));
}

// ============================================================================
// Update System
// ============================================================================

const UpdateSystem = {
  async checkForUpdates(scriptId = null) {
    const scripts = scriptId 
      ? [await ScriptStorage.get(scriptId)].filter(Boolean)
      : await ScriptStorage.getAll();
    
    const updates = [];
    
    for (const script of scripts) {
      if (!script.meta.updateURL && !script.meta.downloadURL) continue;
      
      try {
        const updateUrl = script.meta.updateURL || script.meta.downloadURL;
        const response = await fetch(updateUrl);
        if (!response.ok) continue;
        
        const newCode = await response.text();
        const parsed = parseUserscript(newCode);
        if (parsed.error) continue;
        
        if (this.compareVersions(parsed.meta.version, script.meta.version) > 0) {
          updates.push({
            id: script.id,
            name: script.meta.name,
            currentVersion: script.meta.version,
            newVersion: parsed.meta.version,
            code: newCode
          });
        }
      } catch (e) {
        console.error('[EspressoMonkey] Update check failed for:', script.meta.name, e);
      }
    }
    
    return updates;
  },
  
  compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  },
  
  async applyUpdate(scriptId, newCode) {
    const script = await ScriptStorage.get(scriptId);
    if (!script) return { error: 'Script not found' };
    
    const parsed = parseUserscript(newCode);
    if (parsed.error) return parsed;
    
    script.code = newCode;
    script.meta = parsed.meta;
    script.updatedAt = Date.now();
    
    await ScriptStorage.set(scriptId, script);
    
    const settings = await SettingsManager.get();
    if (settings.notifyOnUpdate) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'images/icon128.png',
        title: 'Script Updated',
        message: `${script.meta.name} updated to v${script.meta.version}`
      });
    }
    
    return { success: true, script };
  },
  
  async autoUpdate() {
    const settings = await SettingsManager.get();
    if (!settings.autoUpdate) return;
    
    const updates = await this.checkForUpdates();
    for (const update of updates) {
      await this.applyUpdate(update.id, update.code);
    }
    
    await SettingsManager.set('lastUpdateCheck', Date.now());
  }
};

// ============================================================================
// Cloud Sync
// ============================================================================

const CloudSync = {
  // Use providers from imported CloudSyncProviders module
  get providers() {
    return CloudSyncProviders;
  },
  
  async sync() {
    const settings = await SettingsManager.get();
    if (!settings.syncEnabled || settings.syncProvider === 'none') return;
    
    const provider = this.providers[settings.syncProvider];
    if (!provider) return;
    
    try {
      // Get local data
      const scripts = await ScriptStorage.getAll();
      const localData = {
        version: 1,
        timestamp: Date.now(),
        scripts: scripts.map(s => ({
          id: s.id,
          code: s.code,
          enabled: s.enabled,
          position: s.position,
          updatedAt: s.updatedAt
        }))
      };
      
      // Get remote data
      const remoteData = await provider.download(settings);
      
      if (remoteData) {
        // Merge: prefer newer versions
        const merged = this.mergeData(localData, remoteData);
        
        // Apply merged data locally
        for (const script of merged.scripts) {
          const existing = await ScriptStorage.get(script.id);
          if (!existing || script.updatedAt > existing.updatedAt) {
            const parsed = parseUserscript(script.code);
            if (!parsed.error) {
              await ScriptStorage.set(script.id, {
                id: script.id,
                code: script.code,
                meta: parsed.meta,
                enabled: script.enabled,
                position: script.position,
                updatedAt: script.updatedAt,
                createdAt: existing?.createdAt || script.updatedAt
              });
            }
          }
        }
        
        // Upload merged data
        merged.timestamp = Date.now();
        await provider.upload(merged, settings);
      } else {
        // First sync, just upload
        await provider.upload(localData, settings);
      }
      
      await SettingsManager.set('lastSync', Date.now());
      return { success: true };
    } catch (e) {
      console.error('[EspressoMonkey] Sync failed:', e);
      return { error: e.message };
    }
  },
  
  mergeData(local, remote) {
    const scriptsMap = new Map();
    
    // Add all local scripts
    for (const script of local.scripts) {
      scriptsMap.set(script.id, script);
    }
    
    // Merge remote scripts (prefer newer)
    for (const script of remote.scripts) {
      const existing = scriptsMap.get(script.id);
      if (!existing || script.updatedAt > existing.updatedAt) {
        scriptsMap.set(script.id, script);
      }
    }
    
    return {
      version: 1,
      timestamp: Date.now(),
      scripts: Array.from(scriptsMap.values())
    };
  }
};

// ============================================================================
// Import/Export
// ============================================================================

async function exportAllScripts() {
  const scripts = await ScriptStorage.getAll();
  const settings = await SettingsManager.get();
  
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    settings: settings,
    scripts: scripts.map(s => ({
      id: s.id,
      code: s.code,
      enabled: s.enabled,
      position: s.position,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt
    }))
  };
}

async function importScripts(data, options = {}) {
  const { overwrite = false } = options;
  const results = { imported: 0, skipped: 0, errors: [] };
  
  if (!data.scripts || !Array.isArray(data.scripts)) {
    return { error: 'Invalid import format' };
  }
  
  for (const script of data.scripts) {
    try {
      const parsed = parseUserscript(script.code);
      if (parsed.error) {
        results.errors.push({ name: script.id, error: parsed.error });
        continue;
      }
      
      const existing = await ScriptStorage.get(script.id);
      if (existing && !overwrite) {
        results.skipped++;
        continue;
      }
      
      await ScriptStorage.set(script.id, {
        id: script.id,
        code: script.code,
        meta: parsed.meta,
        enabled: script.enabled ?? true,
        position: script.position ?? 0,
        createdAt: script.createdAt || Date.now(),
        updatedAt: script.updatedAt || Date.now()
      });
      results.imported++;
    } catch (e) {
      results.errors.push({ name: script.id, error: e.message });
    }
  }
  
  // Import settings if present
  if (data.settings && options.importSettings) {
    await SettingsManager.set(data.settings);
  }
  
  // Re-register all scripts after import
  await registerAllScripts();
  
  return results;
}

// Export to ZIP (Tampermonkey-compatible format)
async function exportToZip() {
  const scripts = await ScriptStorage.getAll();
  const files = {}; // fflate uses { filename: Uint8Array } format
  
  for (const script of scripts) {
    // Create safe filename
    const safeName = (script.meta.name || 'unnamed')
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100);
    
    // Add the userscript file
    files[`${safeName}.user.js`] = fflate.strToU8(script.code);
    
    // Add options.json (Tampermonkey format)
    const options = {
      settings: {
        enabled: script.enabled,
        'run-at': script.meta['run-at'] || 'document-idle',
        override: {
          use_includes: [],
          use_matches: [],
          use_excludes: [],
          use_connects: [],
          merge_includes: true,
          merge_matches: true,
          merge_excludes: true,
          merge_connects: true
        }
      },
      meta: {
        name: script.meta.name,
        namespace: script.meta.namespace || '',
        version: script.meta.version || '1.0',
        description: script.meta.description || '',
        author: script.meta.author || '',
        match: script.meta.match || [],
        include: script.meta.include || [],
        exclude: script.meta.exclude || [],
        grant: script.meta.grant || [],
        require: script.meta.require || [],
        resource: script.meta.resource || []
      }
    };
    files[`${safeName}.options.json`] = fflate.strToU8(JSON.stringify(options, null, 2));
    
    // Add storage.json if script has stored values
    const values = await ScriptValues.getAll(script.id);
    if (values && Object.keys(values).length > 0) {
      const storage = { data: values };
      files[`${safeName}.storage.json`] = fflate.strToU8(JSON.stringify(storage, null, 2));
    }
  }
  
  // Generate zip as Uint8Array then convert to base64
  const zipData = fflate.zipSync(files, { level: 6 });
  const base64 = btoa(String.fromCharCode(...zipData));
  return { zipData: base64, filename: `espressomonkey-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip` };
}

// Import from ZIP (supports Tampermonkey and other formats)
async function importFromZip(zipData, options = {}) {
  const results = { imported: 0, skipped: 0, errors: [] };
  
  try {
    // Convert base64 to Uint8Array if needed
    let zipBytes;
    if (typeof zipData === 'string') {
      // Base64 string
      const binaryString = atob(zipData);
      zipBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        zipBytes[i] = binaryString.charCodeAt(i);
      }
    } else if (zipData instanceof ArrayBuffer) {
      zipBytes = new Uint8Array(zipData);
    } else {
      zipBytes = zipData;
    }
    
    // Load the zip file using fflate
    const unzipped = fflate.unzipSync(zipBytes);
    const fileNames = Object.keys(unzipped);
    
    // Find all .user.js files
    const userScripts = fileNames.filter(name => name.endsWith('.user.js'));
    
    for (const filename of userScripts) {
      try {
        const code = fflate.strFromU8(unzipped[filename]);
        
        // Validate it's a userscript
        if (!code.includes('==UserScript==')) {
          results.errors.push({ name: filename, error: 'Not a valid userscript' });
          continue;
        }
        
        const parsed = parseUserscript(code);
        if (parsed.error) {
          results.errors.push({ name: filename, error: parsed.error });
          continue;
        }
        
        // Check for existing script with same name/namespace
        const allScripts = await ScriptStorage.getAll();
        const existing = allScripts.find(s => 
          s.meta.name === parsed.meta.name && 
          (s.meta.namespace === parsed.meta.namespace || (!s.meta.namespace && !parsed.meta.namespace))
        );
        
        if (existing && !options.overwrite) {
          results.skipped++;
          continue;
        }
        
        // Look for associated options and storage files
        const baseName = filename.replace('.user.js', '');
        const optionsFileData = unzipped[`${baseName}.options.json`];
        const storageFileData = unzipped[`${baseName}.storage.json`];
        
        let enabled = true;
        let storedValues = {};
        
        // Parse options file if exists
        if (optionsFileData) {
          try {
            const optionsData = JSON.parse(fflate.strFromU8(optionsFileData));
            enabled = optionsData.settings?.enabled !== false;
          } catch (e) {
            console.warn('Failed to parse options file:', e);
          }
        }
        
        // Parse storage file if exists
        if (storageFileData) {
          try {
            const storageData = JSON.parse(fflate.strFromU8(storageFileData));
            storedValues = storageData.data || storageData || {};
          } catch (e) {
            console.warn('Failed to parse storage file:', e);
          }
        }
        
        // Create or update script
        const scriptId = existing?.id || generateId();
        const script = {
          id: scriptId,
          code: code,
          meta: parsed.meta,
          enabled: enabled,
          position: existing?.position ?? (await ScriptStorage.getAll()).length,
          createdAt: existing?.createdAt || Date.now(),
          updatedAt: Date.now()
        };
        
        await ScriptStorage.set(scriptId, script);
        
        // Import stored values
        if (Object.keys(storedValues).length > 0) {
          await ScriptValues.setAll(scriptId, storedValues);
        }
        
        results.imported++;
      } catch (e) {
        results.errors.push({ name: filename, error: e.message });
      }
    }
    
    // If no .user.js files found, try importing raw JS files
    if (userScripts.length === 0) {
      const jsFiles = fileNames.filter(name => 
        name.endsWith('.js') && !name.includes('/')
      );
      
      for (const filename of jsFiles) {
        try {
          const code = fflate.strFromU8(unzipped[filename]);
          if (!code.includes('==UserScript==')) continue;
          
          const parsed = parseUserscript(code);
          if (parsed.error) continue;
          
          const scriptId = generateId();
          await ScriptStorage.set(scriptId, {
            id: scriptId,
            code: code,
            meta: parsed.meta,
            enabled: true,
            position: (await ScriptStorage.getAll()).length,
            createdAt: Date.now(),
            updatedAt: Date.now()
          });
          results.imported++;
        } catch (e) {
          results.errors.push({ name: filename, error: e.message });
        }
      }
    }
    
    await updateBadge();
    
    // Re-register all scripts after import
    await registerAllScripts();
    
    return results;
    
  } catch (e) {
    console.error('Zip import error:', e);
    return { error: 'Failed to read zip file: ' + e.message };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

function generateId() {
  return 'script_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}

// ============================================================================
// Message Handlers
// ============================================================================

// Regular message listener (content scripts, popup, dashboard)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true;
});

// USER_SCRIPT world message listener (for GM_* APIs)
// This is SEPARATE from onMessage and required for messaging: true to work
if (chrome.runtime.onUserScriptMessage) {
  chrome.runtime.onUserScriptMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender).then(sendResponse);
    return true;
  });
  console.log('[EspressoMonkey] User script message listener registered');
}

async function handleMessage(message, sender) {
  const { action } = message;
  // Support both patterns: { action, data: { ... } } and { action, prop1, prop2, ... }
  const data = message.data || message;
  
  try {
    switch (action) {
      // Script Management
      case 'getScripts': {
        const scripts = await ScriptStorage.getAll();
        // Convert meta -> metadata for dashboard compatibility
        return { scripts: scripts.map(s => ({ ...s, metadata: s.meta })) };
      }
        
      case 'getScript': {
        const script = await ScriptStorage.get(data.id);
        if (script) {
          return { ...script, metadata: script.meta };
        }
        return null;
      }
        
      case 'saveScript': {
        const parsed = parseUserscript(data.code);
        if (parsed.error) return { error: parsed.error };
        
        const id = data.id || generateId();
        const existing = await ScriptStorage.get(id);
        
        const script = {
          id,
          code: data.code,
          meta: parsed.meta,
          enabled: data.enabled !== undefined ? data.enabled : (existing?.enabled ?? true),
          position: existing?.position ?? (await ScriptStorage.getAll()).length,
          createdAt: existing?.createdAt || Date.now(),
          updatedAt: Date.now()
        };
        
        await ScriptStorage.set(id, script);
        updateBadge();
        
        // Re-register the script with userScripts API
        await unregisterScript(id);
        if (script.enabled) {
          await registerScript(script);
        }
        
        const settings = await SettingsManager.get();
        if (!existing && settings.notifyOnInstall) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'images/icon128.png',
            title: 'Script Installed',
            message: `${script.meta.name} v${script.meta.version}`
          });
        }
        
        // Return with metadata property for dashboard compatibility
        return { success: true, scriptId: id, script: { ...script, metadata: script.meta } };
      }
      
      case 'createScript': {
        // Create a new script - similar to saveScript but always generates new ID
        const parsed = parseUserscript(data.code);
        if (parsed.error) return { error: parsed.error };
        
        const id = generateId();
        const script = {
          id,
          code: data.code,
          meta: parsed.meta,
          enabled: true,
          position: (await ScriptStorage.getAll()).length,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        
        await ScriptStorage.set(id, script);
        updateBadge();
        
        // Register the new script
        await registerScript(script);
        
        const settings = await SettingsManager.get();
        if (settings.notifyOnInstall) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'images/icon128.png',
            title: 'Script Created',
            message: `${script.meta.name} v${script.meta.version}`
          });
        }
        
        // Return scriptId for dashboard compatibility
        return { success: true, scriptId: id, script: { ...script, metadata: script.meta } };
      }
      
      case 'deleteScript': {
        const scriptId = data.id || data.scriptId;
        await unregisterScript(scriptId);
        await ScriptStorage.delete(scriptId);
        updateBadge();
        return { success: true };
      }
        
      case 'toggleScript': {
        const scriptId = data.id || data.scriptId;
        const script = await ScriptStorage.get(scriptId);
        if (script) {
          script.enabled = data.enabled;
          script.updatedAt = Date.now();
          await ScriptStorage.set(scriptId, script);
          
          // Update userScripts registration
          await unregisterScript(scriptId);
          if (script.enabled) {
            await registerScript(script);
          }
          
          updateBadge();
        }
        return { success: true };
      }
      
      case 'importScript': {
        const parsed = parseUserscript(data.code);
        if (parsed.error) return { error: parsed.error };
        
        const id = generateId();
        const script = {
          id,
          code: data.code,
          meta: parsed.meta,
          enabled: true,
          position: (await ScriptStorage.getAll()).length,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        
        await ScriptStorage.set(id, script);
        await registerScript(script);
        updateBadge();
        // Return with metadata property for dashboard compatibility
        return { success: true, script: { ...script, metadata: script.meta } };
      }
      
      case 'duplicateScript': {
        const newScript = await ScriptStorage.duplicate(data.id);
        if (newScript) {
          await registerScript(newScript);
          updateBadge();
          // Return with metadata property for dashboard compatibility
          return { success: true, script: { ...newScript, metadata: newScript.meta } };
        }
        return { error: 'Script not found' };
      }
      
      case 'searchScripts': {
        const scripts = await ScriptStorage.search(data.query);
        return { scripts: scripts.map(s => ({ ...s, metadata: s.meta })) };
      }
        
      case 'reorderScripts':
        await ScriptStorage.reorder(data.orderedIds);
        return { success: true };
        
      // Script Values
      case 'GM_getValue':
        return await ScriptValues.get(data.scriptId, data.key, data.defaultValue);
        
      case 'GM_setValue':
        return await ScriptValues.set(data.scriptId, data.key, data.value);
        
      case 'GM_deleteValue':
      case 'deleteScriptValue':
        await ScriptValues.delete(data.scriptId, data.key);
        return { success: true };
        
      case 'GM_listValues':
        return await ScriptValues.list(data.scriptId);
        
      case 'GM_getValues':
        return await ScriptValues.getAll(data.scriptId);
        
      case 'GM_setValues':
        await ScriptValues.setAll(data.scriptId, data.values);
        return { success: true };
        
      case 'GM_deleteValues':
        await ScriptValues.deleteMultiple(data.scriptId, data.keys);
        return { success: true };
        
      case 'getScriptStorage':
      case 'getScriptValues': {
        const values = await ScriptValues.getAll(data.scriptId);
        return { values };
      }
        
      case 'setScriptStorage':
        await ScriptValues.setAll(data.scriptId, data.values);
        return { success: true };
        
      case 'getStorageSize':
        return await ScriptValues.getStorageSize(data.scriptId);
        
      // Tab Storage
      case 'GM_getTab':
        return TabStorage.get(sender.tab?.id);
        
      case 'GM_saveTab':
        TabStorage.set(sender.tab?.id, data.data);
        return { success: true };
        
      case 'GM_getTabs':
        return TabStorage.getAll();
        
      // Settings
      case 'getSettings': {
        const settings = await SettingsManager.get();
        return { settings };
      }
        
      case 'getSetting':
        return await SettingsManager.get(data.key);
        
      case 'setSettings': {
        const oldSettings = await SettingsManager.get();
        const result = await SettingsManager.set(data.settings);
        
        // If global enabled state changed, re-register all scripts
        if ('enabled' in data.settings && data.settings.enabled !== oldSettings.enabled) {
          await registerAllScripts();
        }
        
        return result;
      }
        
      case 'resetSettings':
        return await SettingsManager.reset();
        
      // Updates
      case 'checkUpdates':
        return await UpdateSystem.checkForUpdates(data?.scriptId);
        
      case 'applyUpdate':
        return await UpdateSystem.applyUpdate(data.scriptId, data.code);
        
      // Sync
      case 'sync':
        return await CloudSync.sync();
        
      case 'testSync': {
        const settings = await SettingsManager.get();
        const provider = CloudSync.providers[settings.syncProvider];
        if (provider) {
          return await provider.test(settings);
        }
        return false;
      }
      
      // Cloud Sync Provider Management
      case 'connectSyncProvider': {
        const providerName = data.provider;
        const provider = CloudSyncProviders[providerName];
        if (!provider) return { success: false, error: 'Unknown provider' };
        
        try {
          const settings = await SettingsManager.get();
          const result = await provider.connect(settings);
          
          if (result.success) {
            const updates = {};
            if (providerName === 'googledrive') {
              updates.googleDriveConnected = true;
              updates.googleDriveUser = result.user;
            } else if (providerName === 'dropbox') {
              updates.dropboxToken = result.token;
              if (result.user) updates.dropboxUser = result.user;
              // Fetch user info after connecting
              const status = await provider.getStatus({ dropboxToken: result.token });
              if (status.user) updates.dropboxUser = status.user;
            }
            updates.syncProvider = providerName;
            await SettingsManager.set(updates);
          }
          return result;
        } catch (e) {
          return { success: false, error: e.message };
        }
      }
      
      case 'disconnectSyncProvider': {
        const providerName = data.provider;
        const provider = CloudSyncProviders[providerName];
        if (!provider) return { success: false, error: 'Unknown provider' };
        
        try {
          const settings = await SettingsManager.get();
          await provider.disconnect(settings);
          
          const updates = { syncProvider: 'none' };
          if (providerName === 'googledrive') {
            updates.googleDriveConnected = false;
            updates.googleDriveUser = null;
          } else if (providerName === 'dropbox') {
            updates.dropboxToken = '';
            updates.dropboxUser = null;
          }
          await SettingsManager.set(updates);
          return { success: true };
        } catch (e) {
          return { success: false, error: e.message };
        }
      }
      
      case 'getSyncProviderStatus': {
        const providerName = data.provider;
        const provider = CloudSyncProviders[providerName];
        if (!provider) return { connected: false };
        
        const settings = await SettingsManager.get();
        if (provider.getStatus) {
          return await provider.getStatus(settings);
        }
        return { connected: false };
      }
      
      case 'syncNow': {
        return await CloudSync.sync();
      }
      
      // Values Editor - Get all scripts' values
      case 'getAllScriptsValues': {
        const scripts = await ScriptStorage.getAll();
        const allValues = {};
        for (const script of scripts) {
          const values = await ScriptValues.getAll(script.id);
          if (values && Object.keys(values).length > 0) {
            allValues[script.id] = {
              scriptName: script.meta?.name || 'Unknown Script',
              values
            };
          }
        }
        return { allValues };
      }
      
      // Values Editor - Set a single value
      case 'setScriptValue': {
        await ScriptValues.set(data.scriptId, data.key, data.value);
        return { success: true };
      }
      
      // Values Editor - Delete a value
      case 'deleteScriptValue': {
        await ScriptValues.delete(data.scriptId, data.key);
        return { success: true };
      }
      
      // Values Editor - Clear all values for a script
      case 'clearScriptStorage': {
        await ScriptValues.deleteAll(data.scriptId);
        return { success: true };
      }
      
      // Per-Script Settings
      case 'getScriptSettings': {
        const script = await ScriptStorage.get(data.scriptId);
        if (!script) return { error: 'Script not found' };
        return { settings: script.settings || {} };
      }
      
      case 'setScriptSettings': {
        const script = await ScriptStorage.get(data.scriptId);
        if (!script) return { error: 'Script not found' };
        
        script.settings = { ...script.settings, ...data.settings };
        script.updatedAt = Date.now();
        await ScriptStorage.set(data.scriptId, script);
        
        // Re-register if needed
        await unregisterScript(data.scriptId);
        if (script.enabled) {
          await registerScript(script);
        }
        
        return { success: true };
      }
      
      // Import/Export
      case 'exportAll':
        return await exportAllScripts();
        
      case 'importAll':
        return await importScripts(data.data, data.options);
        
      case 'exportZip':
        return await exportToZip();
      
      case 'importFromZip':
        return await importFromZip(data.zipData, data.options || {});
      
      case 'installFromUrl':
        return await installFromUrl(data.url);
        
      // Resources
      case 'fetchResource':
        return await ResourceCache.fetch(data.url);
        
      // XHR - Using fetch() since XMLHttpRequest is not available in Service Workers
      // Provides abort support via AbortController and simulates events
      case 'GM_xmlhttpRequest': {
        try {
          if (!data.url) {
            return { error: 'No URL provided', type: 'error' };
          }
          
          const tabId = sender.tab?.id;
          const request = XhrManager.create(tabId, data.scriptId, data);
          const { id: requestId } = request;
          
          // Create AbortController for this request
          const controller = new AbortController();
          request.controller = controller;
          
          // Function to send event to content script
          const sendEvent = (type, eventData = {}) => {
            if (request.aborted && type !== 'abort') return;
            
            try {
              chrome.tabs.sendMessage(tabId, {
                action: 'xhrEvent',
                data: {
                  requestId,
                  scriptId: data.scriptId,
                  type,
                  ...eventData
                }
              }).catch(() => {});
            } catch (e) {
              // Tab might be closed
            }
          };
          
          // Build fetch options
          const fetchOptions = {
            method: data.method || 'GET',
            headers: data.headers || {},
            signal: controller.signal,
            credentials: data.anonymous ? 'omit' : 'include',
            mode: 'cors'
          };
          
          // Add body for non-GET/HEAD requests
          if (data.data && data.method !== 'GET' && data.method !== 'HEAD') {
            fetchOptions.body = data.data;
          }
          
          // Set timeout
          const settings = await SettingsManager.get();
          const timeoutMs = data.timeout || settings.xhrTimeout || 30000;
          const timeoutId = setTimeout(() => {
            if (!request.aborted) {
              request.aborted = true;
              controller.abort();
              sendEvent('timeout', {
                readyState: 4,
                status: 0,
                statusText: '',
                error: 'Request timed out'
              });
              sendEvent('loadend', { readyState: 4 });
              XhrManager.remove(requestId);
            }
          }, timeoutMs);
          
          // Send loadstart event
          sendEvent('loadstart', {
            readyState: 1,
            status: 0,
            lengthComputable: false,
            loaded: 0,
            total: 0
          });
          
          // Execute the fetch
          (async () => {
            try {
              const response = await fetch(data.url, fetchOptions);
              clearTimeout(timeoutId);
              
              if (request.aborted) return;
              
              // Get response headers as string
              const responseHeaders = [...response.headers.entries()]
                .map(([k, v]) => `${k}: ${v}`)
                .join('\r\n');
              
              // Send readystatechange for headers received
              sendEvent('readystatechange', {
                readyState: 2,
                status: response.status,
                statusText: response.statusText,
                responseHeaders,
                finalUrl: response.url
              });
              
              // Get content length for progress
              const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
              
              // Read response based on responseType
              let responseData;
              let responseText = '';
              
              if (data.responseType === 'arraybuffer') {
                const buffer = await response.arrayBuffer();
                responseData = Array.from(new Uint8Array(buffer));
                sendEvent('progress', {
                  readyState: 3,
                  lengthComputable: contentLength > 0,
                  loaded: buffer.byteLength,
                  total: contentLength || buffer.byteLength
                });
              } else if (data.responseType === 'blob') {
                const blob = await response.blob();
                // Convert blob to data URL for transfer
                responseData = await new Promise((resolve) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result);
                  reader.onerror = () => resolve(null);
                  reader.readAsDataURL(blob);
                });
                sendEvent('progress', {
                  readyState: 3,
                  lengthComputable: contentLength > 0,
                  loaded: blob.size,
                  total: contentLength || blob.size
                });
              } else if (data.responseType === 'json') {
                responseText = await response.text();
                try {
                  responseData = JSON.parse(responseText);
                } catch (e) {
                  responseData = responseText;
                }
                sendEvent('progress', {
                  readyState: 3,
                  lengthComputable: contentLength > 0,
                  loaded: responseText.length,
                  total: contentLength || responseText.length
                });
              } else {
                // Default: text
                responseText = await response.text();
                responseData = responseText;
                sendEvent('progress', {
                  readyState: 3,
                  lengthComputable: contentLength > 0,
                  loaded: responseText.length,
                  total: contentLength || responseText.length
                });
              }
              
              if (request.aborted) return;
              
              // Build final response object
              const finalResponse = {
                readyState: 4,
                status: response.status,
                statusText: response.statusText,
                responseHeaders,
                response: responseData,
                responseText: responseText || (typeof responseData === 'string' ? responseData : JSON.stringify(responseData)),
                finalUrl: response.url,
                lengthComputable: true,
                loaded: responseText?.length || 0,
                total: responseText?.length || 0
              };
              
              // Send load event
              sendEvent('load', finalResponse);
              
              // Send loadend event
              sendEvent('loadend', finalResponse);
              
              // Clean up
              XhrManager.remove(requestId);
              
            } catch (e) {
              clearTimeout(timeoutId);
              
              if (request.aborted) {
                // Already handled by abort
                return;
              }
              
              const isAbort = e.name === 'AbortError';
              const errorType = isAbort ? 'abort' : 'error';
              const errorMsg = isAbort ? 'Request aborted' : (e.message || 'Network error');
              
              sendEvent(errorType, {
                readyState: 4,
                status: 0,
                statusText: '',
                error: errorMsg
              });
              
              sendEvent('loadend', {
                readyState: 4,
                status: 0
              });
              
              XhrManager.remove(requestId);
            }
          })();
          
          // Return request ID immediately so content script can track/abort
          return { requestId, started: true };
          
        } catch (e) {
          console.error('[EspressoMonkey] GM_xmlhttpRequest setup error:', e);
          return { error: e.message || 'Request setup failed', type: 'error' };
        }
      }
      
      // Abort an XHR request
      case 'GM_xmlhttpRequest_abort': {
        const request = XhrManager.get(data.requestId);
        if (request && !request.aborted) {
          request.aborted = true;
          if (request.controller) {
            request.controller.abort();
          }
          XhrManager.remove(data.requestId);
          return { success: true };
        }
        return { success: false };
      }
      
      // Download
      case 'GM_download': {
        try {
          const downloadId = await chrome.downloads.download({
            url: data.url,
            filename: data.name,
            saveAs: data.saveAs || false
          });
          return { success: true, downloadId };
        } catch (e) {
          return { error: e.message };
        }
      }
      
      // Notifications
      case 'GM_notification': {
        const notifId = await chrome.notifications.create({
          type: 'basic',
          iconUrl: data.image || 'images/icon128.png',
          title: data.title || 'EspressoMonkey',
          message: data.text || ''
        });
        return { success: true, id: notifId };
      }
      
      // Open tab
      case 'GM_openInTab': {
        const tab = await chrome.tabs.create({
          url: data.url,
          active: !data.background
        });
        return { success: true, tabId: tab.id };
      }
      
      // Focus tab
      case 'GM_focusTab':
        if (sender.tab?.id) {
          await chrome.tabs.update(sender.tab.id, { active: true });
        }
        return { success: true };
        
      // Get scripts for URL
      case 'getScriptsForUrl': {
        const allScripts = await ScriptStorage.getAll();
        const settings = await SettingsManager.get();
        const url = data.url || data;
        
        // Filter scripts that match this URL (both enabled and disabled for popup display)
        const filtered = allScripts.filter(script => 
          doesScriptMatchUrl(script, url)
        ).sort((a, b) => (a.position || 0) - (b.position || 0));
        
        // Return with metadata property for popup compatibility
        return filtered.map(s => ({ ...s, metadata: s.meta }));
      }
      
      // Update badge for specific tab
      case 'updateBadgeForTab': {
        if (data.tabId && data.url) {
          await updateBadgeForTab(data.tabId, data.url);
        }
        return { success: true };
      }
      
      // Get info
      case 'getExtensionInfo':
        return {
          name: 'EspressoMonkey',
          version: chrome.runtime.getManifest().version,
          scriptHandler: 'EspressoMonkey',
          scriptMetaStr: null
        };
        
      // Register menu command
      case 'registerMenuCommand': {
        // Store menu command for popup to show
        const commands = await chrome.storage.session.get('menuCommands') || {};
        if (!commands.menuCommands) commands.menuCommands = {};
        if (!commands.menuCommands[data.scriptId]) commands.menuCommands[data.scriptId] = [];
        
        commands.menuCommands[data.scriptId].push({
          id: data.commandId,
          caption: data.caption,
          accessKey: data.accessKey
        });
        
        await chrome.storage.session.set(commands);
        return { success: true };
      }
      
      // Get menu commands
      case 'getMenuCommands': {
        const result = await chrome.storage.session.get('menuCommands');
        const allCommands = result?.menuCommands || {};
        const commands = [];
        
        // Flatten commands and add script info
        const scripts = await ScriptStorage.getAll();
        for (const [scriptId, cmds] of Object.entries(allCommands)) {
          const script = scripts.find(s => s.id === scriptId);
          if (script && cmds) {
            cmds.forEach(cmd => {
              commands.push({
                ...cmd,
                scriptId,
                scriptName: script.meta?.name || 'Unknown Script'
              });
            });
          }
        }
        
        return { commands };
      }
      
      // Execute menu command
      case 'executeMenuCommand': {
        // Send to content script
        if (sender.tab?.id) {
          await chrome.tabs.sendMessage(sender.tab.id, {
            action: 'executeMenuCommand',
            data: { scriptId: data.scriptId, commandId: data.commandId }
          });
        }
        return { success: true };
      }
      
      default:
        return { error: 'Unknown action: ' + action };
    }
  } catch (e) {
    console.error('[EspressoMonkey] Message handler error:', e);
    return { error: e.message };
  }
}

// ============================================================================
// Badge Management
// ============================================================================

async function updateBadge(tabId = null) {
  const settings = await SettingsManager.get();
  
  if (!settings.showBadge || settings.enabled === false) {
    chrome.action.setBadgeText({ text: '', tabId: tabId || undefined });
    return;
  }
  
  // If no specific tab, update for all tabs
  if (!tabId) {
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id && tab.url) {
          await updateBadgeForTab(tab.id, tab.url);
        }
      }
    } catch (e) {
      // Fallback: just clear the badge
      chrome.action.setBadgeText({ text: '' });
    }
    return;
  }
}

// Update badge for a specific tab based on its URL
async function updateBadgeForTab(tabId, url) {
  const settings = await SettingsManager.get();
  
  if (!settings.showBadge || settings.enabled === false) {
    chrome.action.setBadgeText({ text: '', tabId });
    return;
  }
  
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
    chrome.action.setBadgeText({ text: '', tabId });
    return;
  }
  
  try {
    // Get scripts that match this URL
    const scripts = await ScriptStorage.getAll();
    const matchingScripts = scripts.filter(script => {
      if (!script.enabled) return false;
      return doesScriptMatchUrl(script, url);
    });
    
    const count = matchingScripts.length;
    chrome.action.setBadgeText({ 
      text: count > 0 ? String(count) : '', 
      tabId 
    });
    chrome.action.setBadgeBackgroundColor({ 
      color: settings.badgeColor || '#22c55e',
      tabId 
    });
  } catch (e) {
    console.error('[EspressoMonkey] Failed to update badge:', e);
  }
}

// Check if a script matches a URL (with URL override support)
function doesScriptMatchUrl(script, url) {
  const meta = script.meta || {};
  const settings = script.settings || {};
  
  try {
    const urlObj = new URL(url);
    
    // Build effective patterns based on settings
    let effectiveMatches = [];
    let effectiveIncludes = [];
    let effectiveExcludes = [];
    
    // Original @match patterns (if enabled)
    if (settings.useOriginalMatches !== false) {
      const origMatches = Array.isArray(meta.match) ? meta.match : (meta.match ? [meta.match] : []);
      effectiveMatches.push(...origMatches);
    }
    
    // User @match patterns
    if (settings.userMatches && settings.userMatches.length > 0) {
      effectiveMatches.push(...settings.userMatches);
    }
    
    // Original @include patterns (if enabled)
    if (settings.useOriginalIncludes !== false) {
      const origIncludes = Array.isArray(meta.include) ? meta.include : (meta.include ? [meta.include] : []);
      effectiveIncludes.push(...origIncludes);
    }
    
    // User @include patterns
    if (settings.userIncludes && settings.userIncludes.length > 0) {
      effectiveIncludes.push(...settings.userIncludes);
    }
    
    // Original @exclude patterns (if enabled)
    if (settings.useOriginalExcludes !== false) {
      const origExcludes = Array.isArray(meta.exclude) ? meta.exclude : (meta.exclude ? [meta.exclude] : []);
      effectiveExcludes.push(...origExcludes);
    }
    
    // User @exclude patterns
    if (settings.userExcludes && settings.userExcludes.length > 0) {
      effectiveExcludes.push(...settings.userExcludes);
    }
    
    // Also check @exclude-match
    const excludeMatches = Array.isArray(meta['exclude-match']) ? meta['exclude-match'] : 
                          (meta['exclude-match'] ? [meta['exclude-match']] : []);
    
    // First check if URL matches any exclude pattern
    for (const pattern of effectiveExcludes) {
      if (matchIncludePattern(pattern, url, urlObj)) return false;
    }
    for (const pattern of excludeMatches) {
      if (matchPattern(pattern, url, urlObj)) return false;
    }
    
    // Then check if URL matches any include/match pattern
    for (const pattern of effectiveMatches) {
      if (matchPattern(pattern, url, urlObj)) return true;
    }
    for (const pattern of effectiveIncludes) {
      if (matchIncludePattern(pattern, url, urlObj)) return true;
    }
    
    return false;
  } catch (e) {
    return false;
  }
}

// Match a @match pattern against a URL
function matchPattern(pattern, url, urlObj) {
  if (!pattern) return false;
  if (pattern === '<all_urls>') return true;
  if (pattern === '*') return true;
  
  try {
    // Parse the pattern
    const patternMatch = pattern.match(/^(\*|https?|file|ftp):\/\/([^/]+)(\/.*)$/);
    if (!patternMatch) return false;
    
    const [, scheme, host, path] = patternMatch;
    
    // Check scheme
    if (scheme !== '*' && scheme !== urlObj.protocol.slice(0, -1)) {
      return false;
    }
    
    // Check host
    if (host !== '*') {
      if (host.startsWith('*.')) {
        const baseDomain = host.slice(2);
        if (urlObj.hostname !== baseDomain && !urlObj.hostname.endsWith('.' + baseDomain)) {
          return false;
        }
      } else if (host !== urlObj.hostname) {
        return false;
      }
    }
    
    // Check path (convert glob to regex)
    const pathRegex = new RegExp('^' + path.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    if (!pathRegex.test(urlObj.pathname + urlObj.search)) {
      return false;
    }
    
    return true;
  } catch (e) {
    return false;
  }
}

// Match an @include pattern (glob-style)
function matchIncludePattern(pattern, url, urlObj) {
  if (!pattern) return false;
  if (pattern === '*') return true;
  
  try {
    // Convert glob to regex
    let regex = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape special chars
      .replace(/\*/g, '.*')                   // * -> .*
      .replace(/\?/g, '.');                   // ? -> .
    
    // Handle scheme wildcards
    regex = regex.replace(/^(\\\*):\/\//, '(https?|file|ftp)://');
    
    const re = new RegExp('^' + regex + '$', 'i');
    return re.test(url);
  } catch (e) {
    return false;
  }
}

// ============================================================================
// Context Menu
// ============================================================================

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'espressomonkey-new',
    title: 'Create script for this site',
    contexts: ['page']
  });
  
  chrome.contextMenus.create({
    id: 'espressomonkey-dashboard',
    title: 'Open EspressoMonkey Dashboard',
    contexts: ['page']
  });
  
  chrome.contextMenus.create({
    id: 'espressomonkey-toggle',
    title: 'Toggle all scripts',
    contexts: ['page']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case 'espressomonkey-new': {
      const url = new URL(tab.url);
      chrome.tabs.create({
        url: `pages/dashboard.html?new=1&host=${encodeURIComponent(url.hostname)}`
      });
      break;
    }
    case 'espressomonkey-dashboard':
      chrome.tabs.create({ url: 'pages/dashboard.html' });
      break;
    case 'espressomonkey-toggle': {
      const settings = await SettingsManager.get();
      await SettingsManager.set('enabled', !settings.enabled);
      updateBadge();
      break;
    }
  }
});

// ============================================================================
// Keyboard Shortcuts
// ============================================================================

chrome.commands.onCommand.addListener(async (command) => {
  switch (command) {
    case 'open_dashboard':
      chrome.tabs.create({ url: 'pages/dashboard.html' });
      break;
    case 'toggle_scripts': {
      const settings = await SettingsManager.get();
      await SettingsManager.set('enabled', !settings.enabled);
      updateBadge();
      
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'images/icon128.png',
        title: 'EspressoMonkey',
        message: settings.enabled ? 'Scripts disabled' : 'Scripts enabled'
      });
      break;
    }
  }
});

// ============================================================================
// Alarms (Auto-update & Sync)
// ============================================================================

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'autoUpdate') {
    await UpdateSystem.autoUpdate();
  } else if (alarm.name === 'autoSync') {
    await CloudSync.sync();
  }
});

async function setupAlarms() {
  const settings = await SettingsManager.get();
  
  // Clear existing alarms
  await chrome.alarms.clearAll();
  
  // Setup auto-update alarm
  if (settings.autoUpdate) {
    chrome.alarms.create('autoUpdate', {
      periodInMinutes: settings.updateInterval / 60000
    });
  }
  
  // Setup sync alarm
  if (settings.syncEnabled && settings.syncProvider !== 'none') {
    chrome.alarms.create('autoSync', {
      periodInMinutes: settings.syncInterval / 60000
    });
  }
}

// ============================================================================
// Tab Listeners (for badge updates)
// ============================================================================

// Update badge when tab is activated
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
      await updateBadgeForTab(activeInfo.tabId, tab.url);
    }
  } catch (e) {
    // Tab might not exist
  }
});

// Update badge when tab URL changes
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    if (tab.url) {
      await updateBadgeForTab(tabId, tab.url);
    }
  }
});

// Update badge when window focus changes
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab?.id && tab.url) {
      await updateBadgeForTab(tab.id, tab.url);
    }
  } catch (e) {
    // Window might not exist
  }
});

// ============================================================================
// Userscript Installation Handler
// ============================================================================

// Intercept navigation to .user.js files
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // Only handle main frame navigation
  if (details.frameId !== 0) return;
  
  const url = details.url;
  
  // Check if this is a .user.js URL
  if (!url.match(/\.user\.js(\?.*)?$/i)) return;
  
  // Don't intercept extension pages
  if (url.startsWith('chrome-extension://')) return;
  
  console.log('[EspressoMonkey] Intercepting userscript URL:', url);
  
  try {
    // Fetch the script content
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const code = await response.text();
    
    // Verify it looks like a userscript
    if (!code.includes('==UserScript==')) {
      console.log('[EspressoMonkey] Not a valid userscript, allowing normal navigation');
      return;
    }
    
    // Store pending install data
    await chrome.storage.local.set({
      pendingInstall: {
        url: url,
        code: code,
        timestamp: Date.now()
      }
    });
    
    // Redirect to install page
    chrome.tabs.update(details.tabId, {
      url: chrome.runtime.getURL('pages/install.html')
    });
    
  } catch (error) {
    console.error('[EspressoMonkey] Failed to fetch script:', error);
    // Store error for install page to display
    await chrome.storage.local.set({
      pendingInstall: {
        url: url,
        error: error.message,
        timestamp: Date.now()
      }
    });
    
    chrome.tabs.update(details.tabId, {
      url: chrome.runtime.getURL('pages/install.html')
    });
  }
}, {
  url: [
    { urlMatches: '.*\\.user\\.js(\\?.*)?$' }
  ]
});

// Handle direct script installation from URL
async function installFromUrl(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const code = await response.text();
    
    if (!code.includes('==UserScript==')) {
      throw new Error('Not a valid userscript');
    }
    
    // Parse and save
    const meta = parseMetadata(code);
    const id = generateId();
    
    const script = {
      id,
      code,
      meta,
      enabled: true,
      autoUpdate: !!(meta.updateURL || meta.downloadURL),
      lastUpdated: Date.now(),
      installUrl: url,
      storage: {},
      order: Date.now()
    };
    
    await ScriptStorage.save(script);
    await updateBadge();
    
    return { success: true, script };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// Initialization
// ============================================================================

async function init() {
  await SettingsManager.init();
  await ScriptStorage.init();
  
  // Configure userScripts world
  await configureUserScriptsWorld();
  
  // Register all enabled scripts
  await registerAllScripts();
  
  await updateBadge();
  await setupAlarms();
  
  console.log('[EspressoMonkey] Service worker ready');
}

// Configure the userScripts execution world
async function configureUserScriptsWorld() {
  try {
    // Check if userScripts API is available
    if (!chrome.userScripts) {
      console.warn('[EspressoMonkey] userScripts API not available - scripts will use fallback injection');
      return;
    }
    
    // Configure the USER_SCRIPT world
    await chrome.userScripts.configureWorld({
      csp: "script-src 'self' 'unsafe-inline' 'unsafe-eval' *",
      messaging: true
    });
    
    console.log('[EspressoMonkey] userScripts world configured');
  } catch (e) {
    console.error('[EspressoMonkey] Failed to configure userScripts world:', e);
  }
}

// Register all enabled scripts with the userScripts API
async function registerAllScripts() {
  try {
    if (!chrome.userScripts) {
      console.warn('[EspressoMonkey] userScripts API not available');
      return;
    }
    
    // First, unregister all existing scripts
    await chrome.userScripts.unregister().catch(() => {});
    
    const scripts = await ScriptStorage.getAll();
    const settings = await SettingsManager.get();
    
    if (!settings.enabled) {
      console.log('[EspressoMonkey] Scripts globally disabled');
      return;
    }
    
    const enabledScripts = scripts.filter(s => s.enabled);
    console.log(`[EspressoMonkey] Registering ${enabledScripts.length} scripts`);
    
    for (const script of enabledScripts) {
      await registerScript(script);
    }
  } catch (e) {
    console.error('[EspressoMonkey] Failed to register scripts:', e);
  }
}

// Register a single script
async function registerScript(script) {
  try {
    if (!chrome.userScripts) return;
    
    const meta = script.meta;
    const settings = script.settings || {};
    
    // Build match patterns with URL override support
    const matches = [];
    const excludeMatches = [];
    
    // Process @match (if enabled in settings)
    if (settings.useOriginalMatches !== false && meta.match && Array.isArray(meta.match)) {
      for (const m of meta.match) {
        if (isValidMatchPattern(m)) {
          matches.push(m);
        }
      }
    }
    
    // Process user @match patterns
    if (settings.userMatches && Array.isArray(settings.userMatches)) {
      for (const m of settings.userMatches) {
        if (isValidMatchPattern(m)) {
          matches.push(m);
        } else {
          // Try to convert glob-style to match pattern
          const converted = convertIncludeToMatch(m);
          if (converted && isValidMatchPattern(converted)) {
            matches.push(converted);
          }
        }
      }
    }
    
    // Process @include (if enabled in settings)
    if (settings.useOriginalIncludes !== false && meta.include && Array.isArray(meta.include)) {
      for (const inc of meta.include) {
        const converted = convertIncludeToMatch(inc);
        if (converted && isValidMatchPattern(converted)) {
          matches.push(converted);
        } else if (inc === '*') {
          matches.push('<all_urls>');
        }
      }
    }
    
    // Process user @include patterns
    if (settings.userIncludes && Array.isArray(settings.userIncludes)) {
      for (const inc of settings.userIncludes) {
        const converted = convertIncludeToMatch(inc);
        if (converted && isValidMatchPattern(converted)) {
          matches.push(converted);
        } else if (inc === '*') {
          matches.push('<all_urls>');
        }
      }
    }
    
    // Process @exclude-match
    if (meta['exclude-match'] && Array.isArray(meta['exclude-match'])) {
      for (const m of meta['exclude-match']) {
        if (isValidMatchPattern(m)) {
          excludeMatches.push(m);
        }
      }
    }
    
    // Process @exclude (if enabled) - convert to exclude matches where possible
    if (settings.useOriginalExcludes !== false && meta.exclude && Array.isArray(meta.exclude)) {
      for (const exc of meta.exclude) {
        const converted = convertIncludeToMatch(exc);
        if (converted && isValidMatchPattern(converted)) {
          excludeMatches.push(converted);
        }
      }
    }
    
    // Process user @exclude patterns
    if (settings.userExcludes && Array.isArray(settings.userExcludes)) {
      for (const exc of settings.userExcludes) {
        const converted = convertIncludeToMatch(exc);
        if (converted && isValidMatchPattern(converted)) {
          excludeMatches.push(converted);
        }
      }
    }
    
    // If no matches, use <all_urls> (some scripts use @include *)
    if (matches.length === 0) {
      matches.push('<all_urls>');
    }
    
    // Map run-at values (with per-script setting override)
    const runAtMap = {
      'document-start': 'document_start',
      'document-end': 'document_end', 
      'document-idle': 'document_idle',
      'document-body': 'document_end'
    };
    
    // Check for per-script runAt override
    let effectiveRunAt = meta['run-at'];
    if (settings.runAt && settings.runAt !== 'default') {
      effectiveRunAt = settings.runAt;
    }
    const runAt = runAtMap[effectiveRunAt] || 'document_idle';
    
    // Fetch @require dependencies
    const requireScripts = [];
    const requires = Array.isArray(meta.require) ? meta.require : (meta.require ? [meta.require] : []);
    
    for (const url of requires) {
      try {
        const code = await fetchRequireScript(url);
        if (code) {
          requireScripts.push({ url, code });
        }
      } catch (e) {
        console.warn(`[EspressoMonkey] Failed to fetch @require ${url}:`, e.message);
      }
    }
    
    // Pre-fetch storage values for this script
    const storedValues = await ScriptValues.getAll(script.id) || {};
    
    // Build the script code with GM API wrapper, @require scripts, and pre-loaded storage
    const wrappedCode = buildWrappedScript(script, requireScripts, storedValues);
    
    // Register the script
    await chrome.userScripts.register([{
      id: script.id,
      matches: matches,
      excludeMatches: excludeMatches.length > 0 ? excludeMatches : undefined,
      js: [{ code: wrappedCode }],
      runAt: runAt,
      allFrames: !meta.noframes,
      world: 'USER_SCRIPT'
    }]);
    
    console.log(`[EspressoMonkey] Registered: ${meta.name} (${requires.length} @require, ${Object.keys(storedValues).length} stored values)`);
  } catch (e) {
    console.error(`[EspressoMonkey] Failed to register ${script.meta.name}:`, e);
  }
}

// Cache for @require scripts (in-memory for current session)
const requireCache = new Map();

// Common library fallback URLs
const LIBRARY_FALLBACKS = {
  'jquery': [
    'https://code.jquery.com/jquery-3.7.1.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js',
    'https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js'
  ],
  'jquery@3': [
    'https://code.jquery.com/jquery-3.7.1.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js'
  ],
  'jquery@2': [
    'https://code.jquery.com/jquery-2.2.4.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jquery/2.2.4/jquery.min.js'
  ],
  'gm_config': [
    'https://cdn.jsdelivr.net/npm/gm_config@2024.12.1/gm_config.min.js',
    'https://cdn.jsdelivr.net/gh/sizzlemctwizzle/GM_config@master/gm_config.js',
    'https://raw.githubusercontent.com/sizzlemctwizzle/GM_config/master/gm_config.js',
    'https://greasyfork.org/scripts/1884-gm-config/code/gm_config.js',
    'https://openuserjs.org/src/libs/sizzle/GM_config.js'
  ],
  'mutation-summary': [
    'https://cdn.jsdelivr.net/npm/mutation-summary@1.0.1/dist/mutation-summary.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/mutation-summary/1.0.1/mutation-summary.min.js',
    'https://unpkg.com/mutation-summary@1.0.1/dist/mutation-summary.min.js'
  ]
};

// Find fallback URLs for a library
function getFallbackUrls(url) {
  const lowerUrl = url.toLowerCase();
  
  // Check for known libraries
  if (lowerUrl.includes('gm_config') || lowerUrl.includes('gm-config') || 
      lowerUrl.includes('gm4_config') || lowerUrl.includes('sizzle/gm_config') ||
      lowerUrl.includes('1884-gm-config')) {
    return LIBRARY_FALLBACKS['gm_config'];
  }
  if (lowerUrl.includes('mutation-summary') || lowerUrl.includes('mutationsummary')) {
    return LIBRARY_FALLBACKS['mutation-summary'];
  }
  if (lowerUrl.includes('jquery')) {
    if (lowerUrl.includes('@2') || lowerUrl.includes('2.')) {
      return LIBRARY_FALLBACKS['jquery@2'];
    }
    return LIBRARY_FALLBACKS['jquery'];
  }
  
  // For unpkg URLs, try jsdelivr as fallback
  if (lowerUrl.includes('unpkg.com')) {
    const jsdelivrUrl = url.replace('unpkg.com', 'cdn.jsdelivr.net/npm');
    return [jsdelivrUrl];
  }
  
  // For rawgit/raw.githubusercontent, try jsdelivr gh
  if (lowerUrl.includes('raw.githubusercontent.com')) {
    // Convert: https://raw.githubusercontent.com/user/repo/branch/path
    // To: https://cdn.jsdelivr.net/gh/user/repo@branch/path
    const match = url.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)/);
    if (match) {
      const [, user, repo, branch, path] = match;
      return [`https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/${path}`];
    }
  }
  
  return [];
}

// Check if a URL is known to be unfetchable (requires auth, blocked by CORS, etc.)
function isUnfetchableUrl(url) {
  const lowerUrl = url.toLowerCase();
  
  // Font Awesome kit URLs require authentication
  if (lowerUrl.includes('kit.fontawesome.com')) {
    return true;
  }
  
  // Google Fonts CSS (not JS, but sometimes used)
  if (lowerUrl.includes('fonts.googleapis.com')) {
    return true;
  }
  
  // URLs with authentication tokens that will fail
  if (lowerUrl.includes('?token=') || lowerUrl.includes('&token=')) {
    return true;
  }
  
  return false;
}

// Fetch a @require script with caching and fallbacks
async function fetchRequireScript(url) {
  console.log(`[EspressoMonkey] Fetching @require: ${url}`);
  
  // Skip URLs that are known to be unfetchable
  if (isUnfetchableUrl(url)) {
    console.warn(`[EspressoMonkey] Skipping unfetchable @require: ${url}`);
    return null;
  }
  
  // Check in-memory cache first
  if (requireCache.has(url)) {
    console.log(`[EspressoMonkey] Using cached @require: ${url}`);
    return requireCache.get(url);
  }
  
  // Check persistent cache in chrome.storage.local
  const cacheKey = `require_cache_${btoa(url).replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100)}`;
  try {
    const cached = await chrome.storage.local.get(cacheKey);
    if (cached[cacheKey]?.code) {
      // Check if cache is less than 7 days old
      const age = Date.now() - (cached[cacheKey].timestamp || 0);
      if (age < 7 * 24 * 60 * 60 * 1000) {
        console.log(`[EspressoMonkey] Using persistent cached @require: ${url}`);
        requireCache.set(url, cached[cacheKey].code);
        return cached[cacheKey].code;
      }
    }
  } catch (e) {
    // Ignore cache errors
  }
  
  // Build list of URLs to try (original + fallbacks)
  const fallbacks = getFallbackUrls(url);
  const urlsToTry = [url, ...fallbacks];
  console.log(`[EspressoMonkey] Will try ${urlsToTry.length} URLs for: ${url}`);
  
  for (const tryUrl of urlsToTry) {
    try {
      console.log(`[EspressoMonkey] Trying: ${tryUrl}`);
      const code = await fetchWithRetry(tryUrl);
      if (code) {
        // Store in both caches
        requireCache.set(url, code);
        
        // Store in persistent cache
        try {
          await chrome.storage.local.set({
            [cacheKey]: { code, timestamp: Date.now(), url: tryUrl }
          });
        } catch (e) {
          // Ignore storage errors
        }
        
        if (tryUrl !== url) {
          console.log(`[EspressoMonkey] Successfully fetched ${url} from fallback: ${tryUrl}`);
        } else {
          console.log(`[EspressoMonkey] Successfully fetched: ${url}`);
        }
        return code;
      }
    } catch (e) {
      console.warn(`[EspressoMonkey] Failed to fetch ${tryUrl}: ${e.message}`);
      // Try next URL
      continue;
    }
  }
  
  console.error(`[EspressoMonkey] Failed to fetch ${url} (tried ${urlsToTry.length} URLs)`);
  return null;
}

// Fetch with retry and proper options
async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'text/javascript, application/javascript, text/plain, */*',
          'Cache-Control': 'no-cache'
        },
        mode: 'cors',
        credentials: 'omit',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const code = await response.text();
      
      // Basic validation - should look like JavaScript
      if (code && code.length > 0) {
        return code;
      }
      
      throw new Error('Empty response');
    } catch (e) {
      if (i === retries) {
        throw e;
      }
      // Wait before retry
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  return null;
}

// Unregister a single script
async function unregisterScript(scriptId) {
  try {
    if (!chrome.userScripts) return;
    await chrome.userScripts.unregister({ ids: [scriptId] });
  } catch (e) {
    // Script might not be registered
  }
}

// Build wrapped script code with GM API
function buildWrappedScript(script, requireScripts = [], preloadedStorage = {}) {
  const meta = script.meta;
  const grants = meta.grant || ['none'];
  
  // Build @require scripts section
  // Code runs INSIDE the IIFE after GM APIs are available, then libraries are exposed to window
  let requireCode = '';
  for (const req of requireScripts) {
    const safeUrl = req.url.replace(/\*\//g, '* /');
    requireCode += `
// @require ${safeUrl}
${req.code}
`;
  }
  
  // After @require code, expose common libraries to window for cross-script access
  const libraryExports = requireCode ? `
  // Expose common @require libraries to window
  if (typeof GM_config !== 'undefined' && typeof window.GM_config === 'undefined') window.GM_config = GM_config;
  if (typeof GM_configStruct !== 'undefined' && typeof window.GM_configStruct === 'undefined') window.GM_configStruct = GM_configStruct;
  if (typeof $ !== 'undefined' && typeof window.$ === 'undefined') window.$ = $;
  if (typeof jQuery !== 'undefined' && typeof window.jQuery === 'undefined') window.jQuery = jQuery;
  if (typeof Fuse !== 'undefined' && typeof window.Fuse === 'undefined') window.Fuse = Fuse;
  if (typeof JSZip !== 'undefined' && typeof window.JSZip === 'undefined') window.JSZip = JSZip;
` : '';
  
  // Build the GM API initialization with pre-loaded storage
  // Get the extension ID at build time so it's available in the wrapper
  const extId = chrome.runtime.id;
  
  const apiInit = `
(function() {
  'use strict';
  
  const scriptId = ${JSON.stringify(script.id)};
  const meta = ${JSON.stringify(meta)};
  const grants = ${JSON.stringify(grants)};
  const grantSet = new Set(grants);
  
  // Channel ID for communication with content script bridge
  // Extension ID is injected at build time since chrome.runtime isn't available in USER_SCRIPT world
  const CHANNEL_ID = ${JSON.stringify('EspressoMonkey_' + extId)};
  
  // console.log('[EspressoMonkey] Script initializing:', meta.name, 'Channel:', CHANNEL_ID);
  
  // Grant checking - @grant none means NO APIs except GM_info
  const hasNone = grantSet.has('none');
  const hasGrant = (n) => {
    if (hasNone) return false;
    if (grants.length === 0) return true;
    return grantSet.has(n) || grantSet.has('*');
  };
  
  // GM_info - always available
  const GM_info = {
    script: {
      name: meta.name || 'Unknown',
      namespace: meta.namespace || '',
      description: meta.description || '',
      version: meta.version || '1.0',
      author: meta.author || '',
      matches: meta.match || [],
      includes: meta.include || [],
      excludes: meta.exclude || [],
      grants: grants,
      resources: {},
      runAt: meta['run-at'] || 'document-idle'
    },
    scriptHandler: 'EspressoMonkey',
    version: '2.3.5'
  };
  
  // Storage cache - mutable so we can refresh it with fresh values from background
  // Pre-loaded values serve as fallback if background fetch fails
  let _cache = ${JSON.stringify(preloadedStorage)};
  let _cacheReady = false; // Track if we've fetched fresh values
  let _cacheReadyPromise = null;
  let _cacheReadyResolve = null;
  
  // XHR request tracking (like Violentmonkey's idMap)
  const _xhrRequests = new Map(); // requestId -> { details, aborted }
  
  // Value change listeners (like Tampermonkey)
  const _valueChangeListeners = new Map(); // listenerId -> { key, callback }
  let _valueChangeListenerId = 0;
  
  // Listen for messages from content script (for menu commands, value changes, and XHR events)
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.channel !== CHANNEL_ID || msg.direction !== 'to-userscript') return;
    
    // Handle menu command execution
    if (msg.type === 'menuCommand' && msg.scriptId === scriptId) {
      const cb = _menuCmds.get(msg.commandId);
      if (cb) try { cb(); } catch(err) { console.error('[EspressoMonkey] Menu command error:', err); }
    }
    
    // Handle value change notifications (cross-tab sync)
    if (msg.type === 'valueChanged' && msg.scriptId === scriptId) {
      const oldValue = _cache[msg.key];
      if (msg.newValue === undefined) {
        delete _cache[msg.key];
      } else {
        _cache[msg.key] = msg.newValue;
      }
      // Notify value change listeners
      _valueChangeListeners.forEach((listener) => {
        if (listener.key === msg.key || listener.key === null) {
          try {
            listener.callback(msg.key, oldValue, msg.newValue, msg.remote !== false);
          } catch (e) {
            console.error('[EspressoMonkey] Value change listener error:', e);
          }
        }
      });
    }
    
    // Handle XHR events
    if (msg.type === 'xhrEvent' && msg.scriptId === scriptId) {
      const request = _xhrRequests.get(msg.requestId);
      if (!request || request.aborted) return;
      
      const { details } = request;
      const eventType = msg.eventType;
      const eventData = msg.data || {};
      
      // Build response object matching GM_xmlhttpRequest spec
      const response = {
        readyState: eventData.readyState || 0,
        status: eventData.status || 0,
        statusText: eventData.statusText || '',
        responseHeaders: eventData.responseHeaders || '',
        response: eventData.response,
        responseText: eventData.responseText || '',
        responseXML: eventData.responseXML,
        finalUrl: eventData.finalUrl || details.url,
        context: details.context,
        lengthComputable: eventData.lengthComputable,
        loaded: eventData.loaded,
        total: eventData.total
      };
      
      // Call appropriate callback
      const callbackName = 'on' + eventType;
      if (eventType.startsWith('upload.')) {
        const uploadEvent = eventType.replace('upload.', '');
        if (details.upload && details.upload['on' + uploadEvent]) {
          try {
            details.upload['on' + uploadEvent](response);
          } catch (e) {
            console.error('[EspressoMonkey] XHR upload callback error:', e);
          }
        }
      } else if (details[callbackName]) {
        try {
          details[callbackName](response);
        } catch (e) {
          console.error('[EspressoMonkey] XHR callback error:', e);
        }
      }
      
      // Clean up on loadend
      if (eventType === 'loadend') {
        _xhrRequests.delete(msg.requestId);
      }
    }
  });
  
  // Bridge ready state tracking
  let _bridgeReady = false;
  let _bridgeReadyPromise = null;
  let _bridgeReadyResolve = null;
  
  // Wait for bridge to be ready
  function waitForBridge() {
    // Check if already ready (content script sets this global)
    if (window.__EspressoMonkey_BridgeReady__ || _bridgeReady) {
      _bridgeReady = true;
      return Promise.resolve();
    }
    
    // Return existing promise if already waiting
    if (_bridgeReadyPromise) return _bridgeReadyPromise;
    
    // Create promise to wait for bridge ready message
    _bridgeReadyPromise = new Promise((resolve) => {
      _bridgeReadyResolve = resolve;
      
      // Listen for bridgeReady message from content script
      function bridgeReadyHandler(event) {
        if (event.source !== window) return;
        const msg = event.data;
        if (!msg || msg.channel !== CHANNEL_ID || msg.direction !== 'to-userscript') return;
        if (msg.type === 'bridgeReady') {
          window.removeEventListener('message', bridgeReadyHandler);
          _bridgeReady = true;
          resolve();
        }
      }
      window.addEventListener('message', bridgeReadyHandler);
      
      // Also check global flag periodically (fallback)
      const checkInterval = setInterval(() => {
        if (window.__EspressoMonkey_BridgeReady__) {
          clearInterval(checkInterval);
          window.removeEventListener('message', bridgeReadyHandler);
          _bridgeReady = true;
          resolve();
        }
      }, 10);
      
      // Timeout after 1 second - bridge should be ready much faster
      setTimeout(() => {
        clearInterval(checkInterval);
        window.removeEventListener('message', bridgeReadyHandler);
        if (!_bridgeReady) {
          // This is normal in some contexts, proceed without warning spam
          _bridgeReady = true;
          resolve();
        }
      }, 1000);
    });
    
    return _bridgeReadyPromise;
  }
  
  // Send message to background via content script bridge
  // USER_SCRIPT world cannot use chrome.runtime.sendMessage directly
  async function sendToBackground(action, data) {
    // Wait for bridge to be ready before sending
    await waitForBridge();
    
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).substring(2) + Date.now().toString(36);
      
      // Set timeout for response
      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler);
        console.warn('[EspressoMonkey] Message timeout (10s):', action);
        resolve(undefined); // Don't reject, just return undefined
      }, 10000);
      
      // Listen for response
      function handler(event) {
        if (event.source !== window) return;
        const msg = event.data;
        if (!msg || msg.channel !== CHANNEL_ID || msg.direction !== 'to-userscript') return;
        if (msg.id !== id) return;
        
        window.removeEventListener('message', handler);
        clearTimeout(timeout);
        
        if (msg.success) {
          resolve(msg.result);
        } else {
          console.warn('[EspressoMonkey] Message error:', action, msg.error);
          resolve(undefined);
        }
      }
      
      window.addEventListener('message', handler);
      
      // Send to content script bridge
      window.postMessage({
        channel: CHANNEL_ID,
        direction: 'to-background',
        id: id,
        action: action,
        data: data
      }, '*');
    });
  }
  
  // Refresh storage cache from background
  // This ensures we have the latest values, not stale values from registration time
  async function _refreshStorageCache() {
    if (_cacheReady) return;
    
    try {
      const freshValues = await sendToBackground('GM_getValues', { scriptId });
      if (freshValues && typeof freshValues === 'object') {
        // Merge fresh values with any local changes made before refresh completed
        _cache = { ..._cache, ...freshValues };
      }
      _cacheReady = true;
      if (_cacheReadyResolve) _cacheReadyResolve();
    } catch (e) {
      // If refresh fails, continue with pre-loaded values
      console.warn('[EspressoMonkey] Storage refresh failed, using cached values:', e.message);
      _cacheReady = true;
      if (_cacheReadyResolve) _cacheReadyResolve();
    }
  }
  
  // Start refreshing cache immediately (don't await - let script start running)
  // Scripts can use GM_getValue immediately with pre-loaded values
  // Fresh values will be available after the async refresh completes
  _refreshStorageCache();
  
  // Synchronous GM_getValue - returns from cache (pre-loaded or refreshed)
  function GM_getValue(key, defaultValue) {
    if (!hasGrant('GM_getValue') && !hasGrant('GM.getValue')) return defaultValue;
    if (key in _cache) return _cache[key];
    return defaultValue;
  }
  
  // GM_setValue - updates cache IMMEDIATELY, persists async (like Tampermonkey/Violentmonkey)
  function GM_setValue(key, value) {
    if (!hasGrant('GM_setValue') && !hasGrant('GM.setValue')) {
      return;
    }
    // Update local cache IMMEDIATELY - this makes subsequent GM_getValue instant
    _cache[key] = value;
    // Persist async (fire and forget) - background handles debouncing
    sendToBackground('GM_setValue', { scriptId, key, value }).catch(() => {});
    return value;
  }
  
  // GM_deleteValue
  function GM_deleteValue(key) {
    if (!hasGrant('GM_deleteValue') && !hasGrant('GM.deleteValue')) return;
    delete _cache[key];
    sendToBackground('GM_deleteValue', { scriptId, key }).catch(() => {});
  }
  
  // GM_listValues - returns cached keys synchronously
  function GM_listValues() {
    if (!hasGrant('GM_listValues') && !hasGrant('GM.listValues')) return [];
    return Object.keys(_cache);
  }
  
  // GM_getValues - Get multiple values at once (like Violentmonkey)
  // Accepts array of keys or object with default values
  function GM_getValues(keysOrDefaults) {
    if (!hasGrant('GM_getValue') && !hasGrant('GM.getValue') && 
        !hasGrant('GM_getValues') && !hasGrant('GM.getValues')) {
      return Array.isArray(keysOrDefaults) ? {} : keysOrDefaults;
    }
    const result = {};
    if (Array.isArray(keysOrDefaults)) {
      // Array of keys - return values or undefined
      for (const key of keysOrDefaults) {
        if (key in _cache) {
          result[key] = _cache[key];
        }
      }
    } else if (typeof keysOrDefaults === 'object' && keysOrDefaults !== null) {
      // Object with defaults - return values or defaults
      for (const key of Object.keys(keysOrDefaults)) {
        result[key] = key in _cache ? _cache[key] : keysOrDefaults[key];
      }
    }
    return result;
  }
  
  // GM_setValues - Set multiple values at once (like Violentmonkey)
  function GM_setValues(values) {
    if (!hasGrant('GM_setValue') && !hasGrant('GM.setValue') &&
        !hasGrant('GM_setValues') && !hasGrant('GM.setValues')) {
      return;
    }
    if (typeof values !== 'object' || values === null) return;
    
    // Update local cache immediately for all values
    for (const [key, value] of Object.entries(values)) {
      _cache[key] = value;
    }
    // Persist all values to background in one call
    sendToBackground('GM_setValues', { scriptId, values }).catch(() => {});
  }
  
  // GM_deleteValues - Delete multiple values at once (like Violentmonkey)
  function GM_deleteValues(keys) {
    if (!hasGrant('GM_deleteValue') && !hasGrant('GM.deleteValue') &&
        !hasGrant('GM_deleteValues') && !hasGrant('GM.deleteValues')) {
      return;
    }
    if (!Array.isArray(keys)) return;
    
    // Delete from local cache immediately
    for (const key of keys) {
      delete _cache[key];
    }
    // Persist deletions to background in one call
    sendToBackground('GM_deleteValues', { scriptId, keys }).catch(() => {});
  }
  
  // GM_addStyle - inject CSS with robust DOM handling
  function GM_addStyle(css) {
    const style = document.createElement('style');
    style.textContent = css;
    style.setAttribute('data-espressomonkey', scriptId);
    
    // Try to inject immediately
    function inject() {
      const target = document.head || document.documentElement || document.body;
      if (target && target.appendChild) {
        try {
          target.appendChild(style);
          return true;
        } catch (e) {
          // appendChild failed, will retry
        }
      }
      return false;
    }
    
    if (!inject()) {
      // DOM not ready - wait for it
      if (document.readyState === 'loading') {
        // Document still loading, wait for DOMContentLoaded
        document.addEventListener('DOMContentLoaded', () => inject(), { once: true });
      } else {
        // Document loaded but no valid target - use MutationObserver
        const observer = new MutationObserver(() => {
          if (inject()) {
            observer.disconnect();
          }
        });
        
        // Observe whatever root we can find
        const root = document.documentElement || document;
        if (root && root.nodeType === Node.ELEMENT_NODE) {
          observer.observe(root, { childList: true, subtree: true });
        }
        
        // Fallback timeout - try one more time after a delay
        setTimeout(() => {
          observer.disconnect();
          if (!style.parentNode) {
            inject();
          }
        }, 1000);
      }
    }
    
    return style;
  }
  
  // GM_xmlhttpRequest - Full implementation with all events (like Violentmonkey)
  function GM_xmlhttpRequest(details) {
    if (!hasGrant('GM_xmlhttpRequest') && !hasGrant('GM.xmlHttpRequest')) {
      console.error('[EspressoMonkey] GM_xmlhttpRequest requires @grant GM_xmlhttpRequest');
      if (details.onerror) details.onerror({ error: 'Permission denied', status: 0 });
      return { abort: () => {} };
    }
    
    // Generate unique request ID
    const localId = 'xhr_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    let requestId = null;
    let aborted = false;
    
    // Store request details for event handling
    _xhrRequests.set(localId, { details, aborted: false });
    
    // Control object returned to the script
    const control = {
      abort: () => {
        aborted = true;
        const request = _xhrRequests.get(localId);
        if (request) {
          request.aborted = true;
        }
        // If we have the server's request ID, send abort
        if (requestId) {
          sendToBackground('GM_xmlhttpRequest_abort', { requestId }).catch(() => {});
        }
        // Call onabort callback
        if (details.onabort) {
          try {
            details.onabort({ error: 'Aborted', status: 0 });
          } catch (e) {}
        }
        _xhrRequests.delete(localId);
      }
    };
    
    // Start the request
    sendToBackground('GM_xmlhttpRequest', {
      scriptId,
      method: details.method || 'GET',
      url: details.url,
      headers: details.headers,
      data: details.data,
      timeout: details.timeout,
      responseType: details.responseType,
      overrideMimeType: details.overrideMimeType,
      user: details.user,
      password: details.password,
      context: details.context,
      anonymous: details.anonymous,
      // Track which callbacks are registered so background knows what to send
      hasCallbacks: {
        onload: !!details.onload,
        onerror: !!details.onerror,
        onprogress: !!details.onprogress,
        onreadystatechange: !!details.onreadystatechange,
        ontimeout: !!details.ontimeout,
        onabort: !!details.onabort,
        onloadstart: !!details.onloadstart,
        onloadend: !!details.onloadend,
        upload: !!(details.upload && (
          details.upload.onprogress || 
          details.upload.onloadstart || 
          details.upload.onload || 
          details.upload.onerror
        ))
      }
    }).then(response => {
      if (aborted) return;
      
      if (!response) {
        // No response (bridge failure)
        if (details.onerror) details.onerror({ error: 'Request failed - no response', status: 0 });
        _xhrRequests.delete(localId);
      } else if (response.error) {
        // Immediate error
        if (details.onerror) details.onerror({ error: response.error, status: 0 });
        _xhrRequests.delete(localId);
      } else if (response.requestId) {
        // Request started, update our map with server's ID
        requestId = response.requestId;
        const request = _xhrRequests.get(localId);
        if (request) {
          request.serverRequestId = requestId;
        }
      }
    }).catch(err => {
      if (aborted) return;
      if (details.onerror) details.onerror({ error: err.message || 'Request failed', status: 0 });
      _xhrRequests.delete(localId);
    });
    
    return control;
  }
  
  // GM_addValueChangeListener - Watch for value changes (like Tampermonkey)
  function GM_addValueChangeListener(key, callback) {
    if (!hasGrant('GM_addValueChangeListener') && !hasGrant('GM.addValueChangeListener')) return null;
    if (typeof callback !== 'function') return null;
    
    const listenerId = ++_valueChangeListenerId;
    _valueChangeListeners.set(listenerId, { key, callback });
    return listenerId;
  }
  
  // GM_removeValueChangeListener - Stop watching for value changes
  function GM_removeValueChangeListener(listenerId) {
    if (!hasGrant('GM_removeValueChangeListener') && !hasGrant('GM.removeValueChangeListener')) return false;
    return _valueChangeListeners.delete(listenerId);
  }
  
  // GM_setClipboard
  function GM_setClipboard(text, type) {
    if (!hasGrant('GM_setClipboard') && !hasGrant('GM.setClipboard')) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
    } else {
      fallbackCopyText(text);
    }
  }
  
  function fallbackCopyText(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch(e) {}
    ta.remove();
  }
  
  // GM_notification
  function GM_notification(details, ondone) {
    if (!hasGrant('GM_notification') && !hasGrant('GM.notification')) return;
    const opts = typeof details === 'string' ? { text: details } : details;
    sendToBackground('GM_notification', {
      scriptId,
      title: opts.title || GM_info.script.name,
      text: opts.text || opts.body || '',
      image: opts.image
    }).catch(() => {});
  }
  
  // GM_openInTab
  function GM_openInTab(url, options) {
    if (!hasGrant('GM_openInTab') && !hasGrant('GM.openInTab')) return null;
    const opts = typeof options === 'boolean' ? { active: !options } : (options || {});
    sendToBackground('GM_openInTab', { url, ...opts }).catch(() => {});
    return { close: () => {}, closed: false, onclose: null };
  }
  
  // GM_download
  function GM_download(details) {
    if (!hasGrant('GM_download') && !hasGrant('GM.download')) return;
    const opts = typeof details === 'string' ? { url: details, name: details.split('/').pop() } : details;
    sendToBackground('GM_download', opts).catch(() => {});
  }
  
  // GM_log
  function GM_log(...args) {
    console.log('[' + GM_info.script.name + ']', ...args);
  }
  
  // GM_registerMenuCommand
  const _menuCmds = new Map();
  function GM_registerMenuCommand(caption, callback, accessKeyOrOptions) {
    if (!hasGrant('GM_registerMenuCommand') && !hasGrant('GM.registerMenuCommand')) return null;
    const id = typeof accessKeyOrOptions === 'string' ? accessKeyOrOptions : 
               (accessKeyOrOptions?.id || Math.random().toString(36).substr(2));
    _menuCmds.set(id, callback);
    sendToBackground('GM_registerMenuCommand', { scriptId, commandId: id, caption }).catch(() => {});
    return id;
  }
  
  function GM_unregisterMenuCommand(id) {
    _menuCmds.delete(id);
    sendToBackground('GM_unregisterMenuCommand', { scriptId, commandId: id }).catch(() => {});
  }
  
  // GM_getResourceText / GM_getResourceURL
  async function GM_getResourceText(name) {
    if (!hasGrant('GM_getResourceText') && !hasGrant('GM.getResourceText')) return null;
    return await sendToBackground('GM_getResourceText', { scriptId, name });
  }
  
  function GM_getResourceURL(name) {
    return null;
  }
  
  // GM_addElement
  function GM_addElement(parentOrTag, tagOrAttrs, attrsOrUndefined) {
    let parent, tag, attrs;
    if (typeof parentOrTag === 'string') {
      tag = parentOrTag;
      attrs = tagOrAttrs;
      parent = document.head || document.documentElement;
    } else {
      parent = parentOrTag;
      tag = tagOrAttrs;
      attrs = attrsOrUndefined;
    }
    const el = document.createElement(tag);
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => {
        if (k === 'textContent') el.textContent = v;
        else if (k === 'innerHTML') el.innerHTML = v;
        else el.setAttribute(k, v);
      });
    }
    if (parent) parent.appendChild(el);
    return el;
  }
  
  // GM_getTab / GM_saveTab / GM_getTabs (stub implementations)
  function GM_getTab(callback) {
    if (callback) callback({});
    return {};
  }
  function GM_saveTab(tab) {}
  function GM_getTabs(callback) {
    if (callback) callback({});
    return {};
  }
  
  // unsafeWindow
  const unsafeWindow = window;
  
  // Helper to wait for cache to be ready (used by async GM.* API)
  function _waitForCache() {
    if (_cacheReady) return Promise.resolve();
    if (!_cacheReadyPromise) {
      _cacheReadyPromise = new Promise(resolve => {
        _cacheReadyResolve = resolve;
      });
    }
    return _cacheReadyPromise;
  }
  
  // GM.* Promise-based API
  // These wait for storage to be refreshed before returning, ensuring fresh values
  const GM = {
    info: GM_info,
    getValue: async (k, d) => {
      await _waitForCache();
      return GM_getValue(k, d);
    },
    setValue: (k, v) => Promise.resolve(GM_setValue(k, v)),
    deleteValue: (k) => Promise.resolve(GM_deleteValue(k)),
    listValues: async () => {
      await _waitForCache();
      return GM_listValues();
    },
    getValues: async (keys) => {
      await _waitForCache();
      return GM_getValues(keys);
    },
    setValues: (vals) => Promise.resolve(GM_setValues(vals)),
    deleteValues: (keys) => Promise.resolve(GM_deleteValues(keys)),
    addStyle: (css) => Promise.resolve(GM_addStyle(css)),
    xmlHttpRequest: (d) => new Promise((res, rej) => {
      const control = GM_xmlhttpRequest({ 
        ...d, 
        onload: res, 
        onerror: (e) => rej(e.error || e) 
      });
      // Return control object for abort support
      return control;
    }),
    notification: (d, ondone) => Promise.resolve(GM_notification(d, ondone)),
    setClipboard: (t, type) => Promise.resolve(GM_setClipboard(t, type)),
    openInTab: (u, o) => Promise.resolve(GM_openInTab(u, o)),
    download: (d) => Promise.resolve(GM_download(d)),
    getResourceText: (n) => GM_getResourceText(n),
    getResourceUrl: (n) => Promise.resolve(GM_getResourceURL(n)),
    registerMenuCommand: (c, cb, o) => Promise.resolve(GM_registerMenuCommand(c, cb, o)),
    unregisterMenuCommand: (id) => Promise.resolve(GM_unregisterMenuCommand(id)),
    addValueChangeListener: (k, cb) => Promise.resolve(GM_addValueChangeListener(k, cb)),
    removeValueChangeListener: (id) => Promise.resolve(GM_removeValueChangeListener(id)),
    getTab: () => Promise.resolve({}),
    saveTab: (t) => Promise.resolve(),
    getTabs: () => Promise.resolve({})
  };

  // CRITICAL: Expose all GM_* functions to window for Tampermonkey/Violentmonkey compatibility
  // Many userscripts access these via window.GM_setValue or just GM_setValue in global scope
  window.GM_info = GM_info;
  window.GM_getValue = GM_getValue;
  window.GM_setValue = GM_setValue;
  window.GM_deleteValue = GM_deleteValue;
  window.GM_listValues = GM_listValues;
  window.GM_getValues = GM_getValues;
  window.GM_setValues = GM_setValues;
  window.GM_deleteValues = GM_deleteValues;
  window.GM_addStyle = GM_addStyle;
  window.GM_xmlhttpRequest = GM_xmlhttpRequest;
  window.GM_setClipboard = GM_setClipboard;
  window.GM_notification = GM_notification;
  window.GM_openInTab = GM_openInTab;
  window.GM_download = GM_download;
  window.GM_log = GM_log;
  window.GM_registerMenuCommand = GM_registerMenuCommand;
  window.GM_unregisterMenuCommand = GM_unregisterMenuCommand;
  window.GM_getResourceText = GM_getResourceText;
  window.GM_getResourceURL = GM_getResourceURL;
  window.GM_addElement = GM_addElement;
  window.GM_getTab = GM_getTab;
  window.GM_saveTab = GM_saveTab;
  window.GM_getTabs = GM_getTabs;
  window.GM_addValueChangeListener = GM_addValueChangeListener;
  window.GM_removeValueChangeListener = GM_removeValueChangeListener;
  window.unsafeWindow = unsafeWindow;
  window.GM = GM;
  
  // ========== DOM HELPER FUNCTIONS ==========
  // These help userscripts handle DOM timing issues gracefully
  // Use these when document.body/head might not exist yet
  
  // Wait for any element matching selector to appear in DOM
  function __waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      // Check if already exists
      const existing = document.querySelector(selector);
      if (existing) return resolve(existing);
      
      let resolved = false;
      const observer = new MutationObserver((mutations, obs) => {
        if (resolved) return;
        const el = document.querySelector(selector);
        if (el) {
          resolved = true;
          obs.disconnect();
          resolve(el);
        }
      });
      
      // Start observing - handle case where documentElement might not exist yet
      const root = document.documentElement || document;
      if (root && typeof root.nodeType !== 'undefined') {
        observer.observe(root, { childList: true, subtree: true });
      }
      
      // Timeout with final check
      setTimeout(() => {
        if (resolved) return;
        observer.disconnect();
        const el = document.querySelector(selector);
        if (el) {
          resolve(el);
        } else {
          reject(new Error('[EspressoMonkey] Timeout waiting for element: ' + selector));
        }
      }, timeout);
    });
  }
  
  // Wait for document.body to be available
  function __waitForBody(timeout = 10000) {
    if (document.body) return Promise.resolve(document.body);
    return __waitForElement('body', timeout);
  }
  
  // Wait for document.head to be available
  function __waitForHead(timeout = 10000) {
    if (document.head) return Promise.resolve(document.head);
    return __waitForElement('head', timeout);
  }
  
  // Safe MutationObserver that waits for target element to exist
  // Prevents "parameter 1 is not of type 'Node'" errors
  function __safeObserve(target, options, callback) {
    // Handle selector string or element
    const element = typeof target === 'string' ? document.querySelector(target) : target;
    
    // If element exists and is valid, observe immediately
    if (element && element.nodeType === Node.ELEMENT_NODE) {
      const observer = new MutationObserver(callback);
      observer.observe(element, options);
      return { observer, promise: Promise.resolve(observer) };
    }
    
    // Element doesn't exist yet - wait for it
    const selectorToWait = typeof target === 'string' ? target : 'body';
    const promise = __waitForElement(selectorToWait)
      .then(el => {
        const observer = new MutationObserver(callback);
        observer.observe(el, options);
        return observer;
      })
      .catch(err => {
        console.warn('[EspressoMonkey] safeObserve - target not found:', err.message);
        return null;
      });
    
    return { observer: null, promise };
  }
  
  // Expose DOM helpers to window for userscripts to use
  window.__EspressoMonkey_waitForElement = __waitForElement;
  window.__EspressoMonkey_waitForBody = __waitForBody;
  window.__EspressoMonkey_waitForHead = __waitForHead;
  window.__EspressoMonkey_safeObserve = __safeObserve;
  
  // Also expose as shorter aliases
  window.waitForElement = __waitForElement;
  window.waitForBody = __waitForBody;
  window.waitForHead = __waitForHead;
  window.safeObserve = __safeObserve;
  
  // GM APIs exposed log disabled for performance
  // console.log('[EspressoMonkey] GM APIs exposed to window for:', meta.name);

  // ============ @require Scripts ============
  // These run after GM APIs are available on window
${requireCode}
${libraryExports}
  // ============ End @require Scripts ============

  // Wait for storage to be refreshed, then execute the userscript
  // This ensures scripts see fresh values when using GM_getValue
  (async function __scriptMonkeyRunner() {
    await _waitForCache();
    try {
`;

  const apiClose = `
    } catch (e) {
      console.error('[EspressoMonkey] Error in ' + ${JSON.stringify(meta.name)} + ':', e);
    }
  })();
})();
`;

  return apiInit + script.code + apiClose;
}

// Helper: Check if a pattern is a valid match pattern
function isValidMatchPattern(pattern) {
  if (!pattern) return false;
  if (pattern === '<all_urls>') return true;
  
  // Basic match pattern validation
  const matchRegex = /^(\*|https?|file|ftp):\/\/(\*|\*\.[^/*]+|[^/*]+)\/.*$/;
  return matchRegex.test(pattern);
}

// Helper: Convert @include glob to @match pattern
function convertIncludeToMatch(include) {
  if (!include) return null;
  
  // If it's already a valid match pattern, return it
  if (isValidMatchPattern(include)) return include;
  
  // Handle common patterns
  if (include === '*') return '<all_urls>';
  
  // Try to convert glob to match pattern
  // Replace ** with * and handle http/https
  let pattern = include;
  
  // Handle patterns like *://example.com/*
  if (pattern.startsWith('*://')) {
    // This is already close to a match pattern, just validate
    return pattern;
  }
  
  // Handle patterns like http://example.com/*
  if (pattern.match(/^https?:\/\//)) {
    // Add wildcard path if not present
    if (!pattern.includes('/*') && !pattern.endsWith('/')) {
      pattern += '/*';
    }
    return pattern;
  }
  
  // Handle patterns like *.example.com
  if (pattern.startsWith('*.')) {
    return '*://' + pattern + '/*';
  }
  
  // Handle patterns like example.com
  if (!pattern.includes('://') && !pattern.startsWith('/')) {
    return '*://' + pattern + '/*';
  }
  
  // Can't convert, return null
  return null;
}

init();
