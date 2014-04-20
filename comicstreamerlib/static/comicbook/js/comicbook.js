/*!
 * Pixastic - JavaScript Image Processing
 * http://pixastic.com/
 * Copyright 2012, Jacob Seidelin
 *
 * Dual licensed under the MPL 1.1 or GPLv3 licenses.
 * http://pixastic.com/license-mpl.txt
 * http://pixastic.com/license-gpl-3.0.txt
 *
 */

 var Pixastic = (function() {

    var worker;

    function createImageData(ctx, width, height) {
        if (ctx.createImageData) {
            return ctx.createImageData(width, height);
        } else {
            return ctx.getImageData(0, 0, width, height);
        }
    }

    function Pixastic(ctx, workerControlPath) {

        var P = {},
            width = ctx.canvas.width,
            height = ctx.canvas.height,
            queue = [],
            workerControlPath = workerControlPath || "";

        if (!worker) {
            if (typeof window.Worker != "undefined") {
                try {
                    worker = new window.Worker(workerControlPath + "pixastic.worker.control.js");
                } catch(e) {
                    if (location.protocol == "file:") {
                        Pixastic.log("Could not create real worker, running from file://")
                    } else {
                        Pixastic.log("Could not create real worker.")
                    }
                }
            }
            if (!worker) {
                worker = new Pixastic.Worker();
            }
        }

        for (var e in Pixastic.Effects) {
            if (Pixastic.Effects.hasOwnProperty(e)) {
                (function(e) {
                    P[e] = function(options) {
                        queue.push({
                            effect : e,
                            options : options
                        });
                        return P;
                    }

                    P.done = function(callback, progress) {
                        var inData, outData;

                        try {
                            inData = ctx.getImageData(0, 0, width, height);
                        } catch(e) {
                            if (location.protocol == "file:") {
                                throw new Error("Could not access image data, running from file://");
                            } else {
                                throw new Error("Could not access image data, is canvas tainted by cross-origin data?");
                            }
                        }

                        outData = createImageData(ctx, width, height);

                        worker.postMessage({
                            queue : queue,
                            inData : inData,
                            outData : outData,
                            width : width,
                            height : height
                        });

                        worker.onmessage = function(message) {
                            var d = message.data;
                            switch (d.event) {
                                case "done" :
                                    ctx.putImageData(d.data, 0, 0);
                                    if (callback) {
                                        callback();
                                    }
                                    if (progress) {
                                        progress(1);
                                    }
                                    break;
                                case "progress" :
                                    if (progress) {
                                        progress(d.data);
                                    }
                                    break;
                                case "error" :
                                    break;
                            }
                        }

                        if (progress) {
                            progress(0);
                        }
                    }
                })(e);
            }
        }
        return P;
    }


    Pixastic.Worker = function() {
        var me = this;
        function processMessage(data) {
            var queue = data.queue,
                inData = data.inData,
                outData = data.outData,
                width = data.width,
                height = data.height,
                tmpData;

            for (var i=0;i<queue.length;i++) {
                var e = queue[i].effect,
                    options = queue[i].options,
                    progressCallback;

                if (i > 0) {
                    tmpData = inData;
                    inData = outData;
                    outData = tmpData;
                }

                if (typeof importScripts == "function") {
                    progressCallback = function(p) {
                        me.onmessage({
                            data : {
                                event : "progress",
                                data : (i + p) / queue.length
                            }
                        });
                        return p;
                    }
                }

                Pixastic.Effects[e](inData.data, outData.data, width, height, options, progressCallback);

                me.onmessage({
                    data : {
                        event : "progress",
                        data : (i+1) / queue.length
                    }
                });
            }

            me.onmessage({
                data : {
                    event : "done",
                    data : outData
                }
            });
        }

        this.postMessage = function(data) {
            setTimeout(function() {
                processMessage(data)
            }, 0);
        };

        this.onmessage = function() {};

    }



    Pixastic.log = function(str) {
        if (typeof console != "undefined" && console.log) {
            console.log("Pixastic: " + str);
        }
    };

    function toCanvas(o) {
        var canvas;
        if (typeof o == "object") {
            if (typeof o.tagName == "string") {
                if (o.tagName.toLowerCase() == "canvas" || o.tagName.toLowerCase() == "img") {
                    canvas = document.createElement("canvas");
                    canvas.width = o.width;
                    canvas.height = o.height;
                    canvas.getContext("2d").drawImage(o, 0,0);
                }
            } else if ((window.ImageData && o instanceof window.ImageData)
                        || (typeof o.width == "number" && typeof o.height == "number" && typeof o.data == "object")) {
                canvas = document.createElement("canvas");
                canvas.width = o.width;
                canvas.height = o.height;
                canvas.getContext("2d").putImageData(o, 0, 0);
            }
        }
        return canvas;
    };

    function toImage(o) {
        var canvas = toCanvas(o),
            image = new Image();
        image.width = canvas.width;
        image.height = canvas.height;
        image.src = canvas.toDataURL();
        return image;
    };

    function toImageData(o) {
        var canvas = toCanvas(o),
            ctx = canvas.getContext("2d");
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
    };

    function histogram(imageData) {
        var values = [],
            i, p,
            data = imageData.data,
            round = Math.round,
            maxValue,
            n = imageData.width * imageData.height;

        for (i=0;i<256;i++) {
            values[i] = 0;
        }

        for (i=0;i<n;i++) {
            p = i * 4;
            values[ round((data[p]+data[p+1]+data[p+2])/3) ]++;
        }

        maxValue = 0;
        for (i=0;i<256;i++) {
            if (values[i] > maxValue) {
                maxValue = values[i];
            }
        }

        return {
            maxValue : maxValue,
            values : values
        };
    }

    Pixastic.toCanvas = toCanvas;
    Pixastic.toImage = toImage;
    Pixastic.toImageData = toImageData;
    Pixastic.histogram = histogram;

    Pixastic.Color = {
        rgb2hsl : function(r, g, b) {
            if (r < 0) r = 0;
            if (g < 0) g = 0;
            if (b < 0) b = 0;
            if (r > 255) r = 0;
            if (g > 255) g = 0;
            if (b > 255) b = 0;
        },

        rgb2hsv : function(r, g, b) {
        },

        rgb2hex : function(r, g, b) {
        },

        hsl2rgb : function(h, s, l) {
        },

        hsv2rgb : function(h, s, v) {
        }

    }

    return Pixastic;

})();




Pixastic.Effects = (function() {

    function defaultOptions(options, defaults) {
        var O = {};
        for (var opt in defaults) {
            if (typeof options[opt] == "undefined") {
                O[opt] = defaults[opt];
            } else {
                O[opt] = options[opt];
            }
        }
        return O;
    }

    function clamp(val, min, max) {
        return Math.min(max, Math.max(min, val));
    }

    function convolve3x3(inData, outData, width, height, kernel, progress, alpha, invert, mono) {
        var idx, r, g, b, a,
            pyc, pyp, pyn,
            pxc, pxp, pxn,
            x, y,
            
            prog, lastProg = 0,
            n = width * height * 4,
            
            k00 = kernel[0][0], k01 = kernel[0][1], k02 = kernel[0][2],
            k10 = kernel[1][0], k11 = kernel[1][1], k12 = kernel[1][2],
            k20 = kernel[2][0], k21 = kernel[2][1], k22 = kernel[2][2],
            
            p00, p01, p02,
            p10, p11, p12,
            p20, p21, p22;
            
        for (y=0;y<height;++y) {
            pyc = y * width * 4;
            pyp = pyc - width * 4;
            pyn = pyc + width * 4;

            if (y < 1) pyp = pyc;
            if (y >= width-1) pyn = pyc;
            
            for (x=0;x<width;++x) {
                idx = (y * width + x) * 4;
                
                pxc = x * 4;
                pxp = pxc - 4;
                pxn = pxc + 4;
          
                if (x < 1) pxp = pxc;
                if (x >= width-1) pxn = pxc;
                
                p00 = pyp + pxp;    p01 = pyp + pxc;    p02 = pyp + pxn;
                p10 = pyc + pxp;    p11 = pyc + pxc;    p12 = pyc + pxn;
                p20 = pyn + pxp;    p21 = pyn + pxc;    p22 = pyn + pxn;

                r = inData[p00] * k00 + inData[p01] * k01 + inData[p02] * k02
                  + inData[p10] * k10 + inData[p11] * k11 + inData[p12] * k12
                  + inData[p20] * k20 + inData[p21] * k21 + inData[p22] * k22;

                g = inData[p00 + 1] * k00 + inData[p01 + 1] * k01 + inData[p02 + 1] * k02
                  + inData[p10 + 1] * k10 + inData[p11 + 1] * k11 + inData[p12 + 1] * k12
                  + inData[p20 + 1] * k20 + inData[p21 + 1] * k21 + inData[p22 + 1] * k22;
                  
                b = inData[p00 + 2] * k00 + inData[p01 + 2] * k01 + inData[p02 + 2] * k02
                  + inData[p10 + 2] * k10 + inData[p11 + 2] * k11 + inData[p12 + 2] * k12
                  + inData[p20 + 2] * k20 + inData[p21 + 2] * k21 + inData[p22 + 2] * k22;

                if (alpha) {
                    a = inData[p00 + 3] * k00 + inData[p01 + 3] * k01 + inData[p02 + 3] * k02
                      + inData[p10 + 3] * k10 + inData[p11 + 3] * k11 + inData[p12 + 3] * k12
                      + inData[p20 + 3] * k20 + inData[p21 + 3] * k21 + inData[p22 + 3] * k22;
                } else {
                    a = inData[idx+3];
                }

                if (mono) {
                    r = g = b = (r + g + b) / 3;
                }
                if (invert) {
                    r = 255 - r;
                    g = 255 - g;
                    b = 255 - b;
                }
                
                outData[idx] = r;
                outData[idx+1] = g;
                outData[idx+2] = b;
                outData[idx+3] = a;
                
                if (progress) {
                    prog = (idx/n*100 >> 0) / 100;
                    if (prog > lastProg) {
                        lastProg = progress(prog);
                    }
                }
            }
        }
    }
    
    function convolve5x5(inData, outData, width, height, kernel, progress, alpha, invert, mono) {
        var idx, r, g, b, a,
            pyc, pyp, pyn, pypp, pynn,
            pxc, pxp, pxn, pxpp, pxnn,
            x, y,
            
            prog, lastProg = 0,
            n = width * height * 4,
            
            k00 = kernel[0][0], k01 = kernel[0][1], k02 = kernel[0][2], k03 = kernel[0][3], k04 = kernel[0][4],
            k10 = kernel[1][0], k11 = kernel[1][1], k12 = kernel[1][2], k13 = kernel[1][3], k14 = kernel[1][4],
            k20 = kernel[2][0], k21 = kernel[2][1], k22 = kernel[2][2], k23 = kernel[2][3], k24 = kernel[2][4],
            k30 = kernel[3][0], k31 = kernel[3][1], k32 = kernel[3][2], k33 = kernel[3][3], k34 = kernel[3][4],
            k40 = kernel[4][0], k41 = kernel[4][1], k42 = kernel[4][2], k43 = kernel[4][3], k44 = kernel[4][4],
            
            p00, p01, p02, p03, p04,
            p10, p11, p12, p13, p14,
            p20, p21, p22, p23, p24,
            p30, p31, p32, p33, p34,
            p40, p41, p42, p43, p44;
            
        for (y=0;y<height;++y) {
            pyc = y * width * 4;
            pyp = pyc - width * 4;
            pypp = pyc - width * 4 * 2;
            pyn = pyc + width * 4;
            pynn = pyc + width * 4 * 2;

            if (y < 1) pyp = pyc;
            if (y >= width-1) pyn = pyc;
            if (y < 2) pypp = pyp;
            if (y >= width-2) pynn = pyn;
            
            for (x=0;x<width;++x) {
                idx = (y * width + x) * 4;
                
                pxc = x * 4;
                pxp = pxc - 4;
                pxn = pxc + 4;
                pxpp = pxc - 8;
                pxnn = pxc + 8;
          
                if (x < 1) pxp = pxc;
                if (x >= width-1) pxn = pxc;
                if (x < 2) pxpp = pxp;
                if (x >= width-2) pxnn = pxn;
                
                p00 = pypp + pxpp;    p01 = pypp + pxp;    p02 = pypp + pxc;    p03 = pypp + pxn;    p04 = pypp + pxnn;
                p10 = pyp  + pxpp;    p11 = pyp  + pxp;    p12 = pyp  + pxc;    p13 = pyp  + pxn;    p14 = pyp  + pxnn;
                p20 = pyc  + pxpp;    p21 = pyc  + pxp;    p22 = pyc  + pxc;    p23 = pyc  + pxn;    p24 = pyc  + pxnn;
                p30 = pyn  + pxpp;    p31 = pyn  + pxp;    p32 = pyn  + pxc;    p33 = pyn  + pxn;    p34 = pyn  + pxnn;
                p40 = pynn + pxpp;    p41 = pynn + pxp;    p42 = pynn + pxc;    p43 = pynn + pxn;    p44 = pynn + pxnn;

                r = inData[p00] * k00 + inData[p01] * k01 + inData[p02] * k02 + inData[p03] * k04 + inData[p02] * k04
                  + inData[p10] * k10 + inData[p11] * k11 + inData[p12] * k12 + inData[p13] * k14 + inData[p12] * k14
                  + inData[p20] * k20 + inData[p21] * k21 + inData[p22] * k22 + inData[p23] * k24 + inData[p22] * k24
                  + inData[p30] * k30 + inData[p31] * k31 + inData[p32] * k32 + inData[p33] * k34 + inData[p32] * k34
                  + inData[p40] * k40 + inData[p41] * k41 + inData[p42] * k42 + inData[p43] * k44 + inData[p42] * k44;
                  
                g = inData[p00+1] * k00 + inData[p01+1] * k01 + inData[p02+1] * k02 + inData[p03+1] * k04 + inData[p02+1] * k04
                  + inData[p10+1] * k10 + inData[p11+1] * k11 + inData[p12+1] * k12 + inData[p13+1] * k14 + inData[p12+1] * k14
                  + inData[p20+1] * k20 + inData[p21+1] * k21 + inData[p22+1] * k22 + inData[p23+1] * k24 + inData[p22+1] * k24
                  + inData[p30+1] * k30 + inData[p31+1] * k31 + inData[p32+1] * k32 + inData[p33+1] * k34 + inData[p32+1] * k34
                  + inData[p40+1] * k40 + inData[p41+1] * k41 + inData[p42+1] * k42 + inData[p43+1] * k44 + inData[p42+1] * k44;
                  
                b = inData[p00+2] * k00 + inData[p01+2] * k01 + inData[p02+2] * k02 + inData[p03+2] * k04 + inData[p02+2] * k04
                  + inData[p10+2] * k10 + inData[p11+2] * k11 + inData[p12+2] * k12 + inData[p13+2] * k14 + inData[p12+2] * k14
                  + inData[p20+2] * k20 + inData[p21+2] * k21 + inData[p22+2] * k22 + inData[p23+2] * k24 + inData[p22+2] * k24
                  + inData[p30+2] * k30 + inData[p31+2] * k31 + inData[p32+2] * k32 + inData[p33+2] * k34 + inData[p32+2] * k34
                  + inData[p40+2] * k40 + inData[p41+2] * k41 + inData[p42+2] * k42 + inData[p43+2] * k44 + inData[p42+2] * k44;

                if (alpha) {
                    a = inData[p00+3] * k00 + inData[p01+3] * k01 + inData[p02+3] * k02 + inData[p03+3] * k04 + inData[p02+3] * k04
                      + inData[p10+3] * k10 + inData[p11+3] * k11 + inData[p12+3] * k12 + inData[p13+3] * k14 + inData[p12+3] * k14
                      + inData[p20+3] * k20 + inData[p21+3] * k21 + inData[p22+3] * k22 + inData[p23+3] * k24 + inData[p22+3] * k24
                      + inData[p30+3] * k30 + inData[p31+3] * k31 + inData[p32+3] * k32 + inData[p33+3] * k34 + inData[p32+3] * k34
                      + inData[p40+3] * k40 + inData[p41+3] * k41 + inData[p42+3] * k42 + inData[p43+3] * k44 + inData[p42+3] * k44;
                } else {
                    a = inData[idx+3];
                }

                if (mono) {
                    r = g = b = (r + g + b) / 3;
                }
                
                if (invert) {
                    r = 255 - r;
                    g = 255 - g;
                    b = 255 - b;
                }
                
                outData[idx] = r;
                outData[idx+1] = g;
                outData[idx+2] = b;
                outData[idx+3] = a;
                
                if (progress) {
                    prog = (idx/n*100 >> 0) / 100;
                    if (prog > lastProg) {
                        lastProg = progress(prog);
                    }
                }
            }
        }
    }
    
    function gaussian(inData, outData, width, height, kernelSize, progress) {
        var r, g, b, a, idx,
            n = width * height * 4,
            x, y, i, j, 
            inx, iny, w,
            tmpData = [],
            maxKernelSize = 13,
            kernelSize = clamp(kernelSize, 3, maxKernelSize),
            k1 = -kernelSize / 2 + (kernelSize % 2 ? 0.5 : 0),
            k2 = kernelSize + k1,
            weights,
            kernels = [[1]],
            prog, lastProg = 0;
            
            
        for (i=1;i<maxKernelSize;++i) {
            kernels[0][i] = 0;
        }
        
        for (i=1;i<maxKernelSize;++i) {
            kernels[i] = [1];
            for (j=1;j<maxKernelSize;++j) {
                kernels[i][j] = kernels[i-1][j] + kernels[i-1][j-1];
            }
        }

        weights = kernels[kernelSize - 1]
        
        for (i=0,w=0;i<kernelSize;++i) {
            w += weights[i];
        }
        for (i=0;i<kernelSize;++i) {
            weights[i] /= w;
        }
        
        // pass 1
        for (y=0;y<height;++y) {
            for (x=0;x<width;++x) {
                r = g = b = a = 0;

                for (i=k1;i<k2;++i) {
                    inx = x + i;
                    iny = y;
                    w = weights[i - k1];
                    
                    if (inx < 0) {
                        inx = 0;
                    }
                    if (inx >= width) {
                        inx = width - 1;
                    }
                    
                    idx = (iny * width + inx) * 4;

                    r += inData[idx] * w;
                    g += inData[idx + 1] * w;
                    b += inData[idx + 2] * w;
                    a += inData[idx + 3] * w;

                }
                
                idx = (y * width + x) * 4;
                
                tmpData[idx] = r;
                tmpData[idx+1] = g;
                tmpData[idx+2] = b;
                tmpData[idx+3] = a;
                
                if (progress) {
                    prog = (idx/n*50 >> 0) / 100;
                    if (prog > lastProg) {
                        lastProg = progress(prog);
                    }
                }
            }
        }
        
        lastProg = 0;
        
        // pass 2
        for (y=0;y<height;++y) {
            for (x=0;x<width;++x) {
                r = g = b = a = 0;

                for (i=k1;i<k2;++i) {
                    inx = x;
                    iny = y + i;
                    w = weights[i - k1];
                    
                    if (iny < 0) {
                        iny = 0;
                    }
                    if (iny >= height) {
                        iny = height - 1;
                    }
                    
                    idx = (iny * width + inx) * 4;
                    
                    r += tmpData[idx] * w;
                    g += tmpData[idx + 1] * w;
                    b += tmpData[idx + 2] * w;
                    a += tmpData[idx + 3] * w;
                }
                
                idx = (y * width + x) * 4;
                
                outData[idx] = r;
                outData[idx+1] = g;
                outData[idx+2] = b;
                outData[idx+3] = a;
                
                if (progress) {
                    prog = 0.5 + (idx/n*50 >> 0) / 100;
                    if (prog > lastProg) {
                        lastProg = progress(prog);
                    }
                }
            }
        }
    }
    
    
    return {

        invert : function(inData, outData, width, height, options, progress) {
            var n = width * height * 4,
                prog, lastProg = 0;

            for (i=0;i<n;i+=4) {
                outData[i] = 255 - inData[i];
                outData[i+1] = 255 - inData[i+1];
                outData[i+2] = 255 - inData[i+2];
                outData[i+3] = inData[i+3];

                
                if (progress) {
                    prog = (i/n*100 >> 0) / 100;
                    if (prog > lastProg) {
                        lastProg = progress(prog);
                    }
                }
            }
        },
        
        sepia : function(inData, outData, width, height, options, progress) {
            var n = width * height * 4,
                prog, lastProg = 0,
                r, g, b;

            for (var i=0;i<n;i+=4) {
                r = inData[i];
                g = inData[i+1];
                b = inData[i+2];
                outData[i] = (r * 0.393 + g * 0.769 + b * 0.189);
                outData[i+1] = (r * 0.349 + g * 0.686 + b * 0.168);
                outData[i+2] = (r * 0.272 + g * 0.534 + b * 0.131);
                outData[i+3] = inData[i+3];
                
                if (progress) {
                    prog = (i/n*100 >> 0) / 100;
                    if (prog > lastProg) {
                        lastProg = progress(prog);
                    }
                }
            }
        },
        
        solarize : function(inData, outData, width, height, options, progress) {
            var n = width * height * 4,
                prog, lastProg = 0,
                r, g, b;

            for (i=0;i<n;i+=4) {
                r = inData[i];
                g = inData[i+1];
                b = inData[i+2];
                
                outData[i] = r > 127 ? 255 - r : r;
                outData[i+1] = g > 127 ? 255 - g : g;
                outData[i+2] = b > 127 ? 255 - b : b;
                outData[i+3] = inData[i+3];
                
                if (progress) {
                    prog = (i/n*100 >> 0) / 100;
                    if (prog > lastProg) {
                        lastProg = progress(prog);
                    }
                }
            }
        },

        brightness : function(inData, outData, width, height, options, progress) {
            options = defaultOptions(options, {
                brightness : 0,
                contrast : 0
            });
            
            var contrast = clamp(options.contrast, -1, 1) / 2,
                brightness = 1 + clamp(options.brightness, -1, 1),
                prog, lastProg = 0,
                r, g, b,
                n = width * height * 4;

            var brightMul = brightness < 0 ? - brightness : brightness;
            var brightAdd = brightness < 0 ? 0 : brightness;

            contrast = 0.5 * Math.tan((contrast + 1) * Math.PI/4);
            contrastAdd = - (contrast - 0.5) * 255;

            for (var i=0;i<n;i+=4) {
                r = inData[i];
                g = inData[i+1];
                b = inData[i+2];
                
                r = (r + r * brightMul + brightAdd) * contrast + contrastAdd;
                g = (g + g * brightMul + brightAdd) * contrast + contrastAdd;
                b = (b + b * brightMul + brightAdd) * contrast + contrastAdd;
                
                outData[i] = r;
                outData[i+1] = g;
                outData[i+2] = b;
                outData[i+3] = inData[i+3];
                
                if (progress) {
                    prog = (i/n*100 >> 0) / 100;
                    if (prog > lastProg) {
                        lastProg = progress(prog);
                    }
                }
            }
        },
        
        desaturate : function(inData, outData, width, height, options, progress) {
            var n = width * height * 4,
                prog, lastProg = 0,
                level;

            for (var i=0;i<n;i+=4) {
                level = inData[i] * 0.3 + inData[i+1] * 0.59 + inData[i+2] * 0.11;
                outData[i] = level;
                outData[i+1] = level;
                outData[i+2] = level;
                outData[i+3] = inData[i+3];
                
                if (progress) {
                    prog = (i/n*100 >> 0) / 100;
                    if (prog > lastProg) {
                        lastProg = progress(prog);
                    }
                }
            }
        },
        
        lighten : function(inData, outData, width, height, options, progress) {
            var n = width * height * 4,
                prog, lastProg = 0,
                mul = 1 + clamp(options.amount, 0, 1);

            for (var i=0;i<n;i+=4) {
                outData[i] = inData[i] * mul;
                outData[i+1] = inData[i+1] * mul;
                outData[i+2] = inData[i+2] * mul;
                outData[i+3] = inData[i+3];
                
                if (progress) {
                    prog = (i/n*100 >> 0) / 100;
                    if (prog > lastProg) {
                        lastProg = progress(prog);
                    }
                }
            }
        },
        
        noise : function(inData, outData, width, height, options, progress) {
            var n = width * height * 4,
                prog, lastProg = 0,
                amount = clamp(options.amount, 0, 1),
                strength = clamp(options.strength, 0, 1),
                mono = !!options.mono,
                random = Math.random,
                rnd, r, g, b;
                
            for (var i=0;i<n;i+=4) {
                r = inData[i];
                g = inData[i+1];
                b = inData[i+2];
                
                rnd = random();
                
                if (rnd < amount) {
                    if (mono) {
                        rnd = strength * ((rnd / amount) * 2 - 1) * 255;
                        r += rnd;
                        g += rnd;
                        b += rnd;
                    } else {
                        r += strength * random() * 255;
                        g += strength * random() * 255;
                        b += strength * random() * 255;
                    }
                }
                
                outData[i] = r;
                outData[i+1] = g;
                outData[i+2] = b;
                outData[i+3] = inData[i+3];
                
                if (progress) {
                    prog = (i/n*100 >> 0) / 100;
                    if (prog > lastProg) {
                        lastProg = progress(prog);
                    }
                }
            }
        },
        
        flipv : function(inData, outData, width, height, options, progress) {
            var inPix, outPix,
                n = width * height * 4,
                prog, lastProg = 0,
                x, y;
            for (y=0;y<height;++y) {
                for (x=0;x<width;++x) {
                    inPix = (y * width + x) * 4;
                    outPix = (y * width + (width - x - 1)) * 4;
                    
                    outData[outPix] = inData[inPix];
                    outData[outPix+1] = inData[inPix+1];
                    outData[outPix+2] = inData[inPix+2];
                    outData[outPix+3] = inData[inPix+3];
                    
                    if (progress) {
                        prog = (inPix/n*100 >> 0) / 100;
                        if (prog > lastProg) {
                            lastProg = progress(prog);
                        }
                    }
                }
            }
        },
        
        fliph : function(inData, outData, width, height, options, progress) {
            var inPix, outPix,
                n = width * height * 4,
                prog, lastProg = 0,
                x, y;
            for (y=0;y<height;++y) {
                for (x=0;x<width;++x) {
                    inPix = (y * width + x) * 4;
                    outPix = ((height - y - 1) * width + x) * 4;
                    
                    outData[outPix] = inData[inPix];
                    outData[outPix+1] = inData[inPix+1];
                    outData[outPix+2] = inData[inPix+2];
                    outData[outPix+3] = inData[inPix+3];
                    
                    if (progress) {
                        prog = (inPix/n*100 >> 0) / 100;
                        if (prog > lastProg) {
                            lastProg = progress(prog);
                        }
                    }
                }
            }
        },

        blur : function(inData, outData, width, height, options, progress) {
            gaussian(inData, outData, width, height, options.kernelSize, progress);
        },

        glow : function(inData, outData, width, height, options, progress) {
            var n = width * height * 4,
                i, r, g, b,
                amount = options.amount,
                tmpData = [],
                gaussProgress,
                prog, lastProg = 0;

            if (progress) {
                gaussProgress = function(p) {
                    progress(p * 0.8);
                    return p;
                }
            }
            
            gaussian(inData, tmpData, width, height, options.kernelSize, gaussProgress);
            
            for (i=0;i<n;i+=4) {
                r = inData[i]   + tmpData[i]   * amount;
                g = inData[i+1] + tmpData[i+1] * amount;
                b = inData[i+2] + tmpData[i+2] * amount;
                if (r > 255) r = 255;
                if (g > 255) g = 255;
                if (b > 255) b = 255;
                outData[i] = r;
                outData[i+1] = g;
                outData[i+2] = b;
                outData[i+3] = inData[i+3];
                
                if (progress) {
                    prog = 0.8 + (i/n*100 >> 0) / 100 * 0.2;
                    if (prog > lastProg) {
                        lastProg = progress(prog);
                    }
                }
            }
        },

        convolve3x3 : function(inData, outData, width, height, options, progress) {
            convolve3x3(inData, outData, width, height, options.kernel, progress);
        },
        
        convolve5x5 : function(inData, outData, width, height, options, progress) {
            convolve3x3(inData, outData, width, height, options.kernel, progress);
        },
        
        // A 3x3 high-pass filter
        sharpen3x3 : function(inData, outData, width, height, options, progress) {
            var a = - clamp(options.strength, 0, 1);
            convolve3x3(
                inData, outData, width, height, 
                [[a,     a, a],
                 [a, 1-a*8, a],
                 [a,     a, a]],
                progress
            );
        },

        // A 5x5 high-pass filter
        sharpen5x5 : function(inData, outData, width, height, options, progress) {
            var a = - clamp(options.strength, 0, 1);
            convolve5x5(
                inData, outData, width, height, 
                [[a, a,      a, a, a],
                 [a, a,      a, a, a],
                 [a, a, 1-a*24, a, a],
                 [a, a,      a, a, a],
                 [a, a,      a, a, a]],
                progress
             );
        },

        // A 3x3 low-pass mean filter
        soften3x3 : function(inData, outData, width, height, options, progress) {
            var c = 1/9;
            convolve3x3(
                inData, outData, width, height, 
                [[c, c, c],
                 [c, c, c],
                 [c, c, c]],
                progress
            );
        },
        
        // A 5x5 low-pass mean filter
        soften5x5 : function(inData, outData, width, height, options, progress) {
            var c = 1/25;
            convolve5x5(
                inData, outData, width, height, 
                [[c, c, c, c, c],
                 [c, c, c, c, c],
                 [c, c, c, c, c],
                 [c, c, c, c, c],
                 [c, c, c, c, c]],
                progress
            );
        },
        
        // A 3x3 Cross edge-detect
        crossedges : function(inData, outData, width, height, options, progress) {
            var a = clamp(options.strength, 0, 1) * 5
            convolve3x3(
                inData, outData, width, height, 
                [[ 0, -a, 0],
                 [-a,  0, a],
                 [ 0,  a, 0]],
                progress,
                false, true
            );
        },
        
        // 3x3 directional emboss
        emboss : function(inData, outData, width, height, options, progress) {
            var amount = options.amount,
                angle = options.angle,
                x = Math.cos(-angle) * amount,
                y = Math.sin(-angle) * amount,
                n = width * height * 4,
                
                a00 = -x - y,
                a10 = -x,
                a20 = y - x,
                a01 = -y,
                a21 = y,
                a02 = -y + x,
                a12 = x,
                a22 = y + x,

                tmpData = [],
                
                prog, lastProg = 0,
                convProgress;
                
            if (progress) {
                convProgress = function(p) {
                    progress(p * 0.5)
                    return p;
                };
            }
            
            convolve3x3(
                inData, tmpData, width, height, 
                [[a00, a01, a02],
                 [a10,   0, a12],
                 [a20, a21, a22]]
            );
            
            for (var i=0;i<n;i+=4) {
                outData[i]   = 128 + tmpData[i];
                outData[i+1] = 128 + tmpData[i+1];
                outData[i+2] = 128 + tmpData[i+2];
                outData[i+3] = inData[i+3];
                
                if (progress) {
                    prog = 0.5 + (i/n*100 >> 0) / 100 * 0.5;
                    if (prog > lastProg) {
                        lastProg = progress(prog);
                    }
                }
            }
        },

        
        // A 3x3 Sobel edge detect (similar to Photoshop's)
        findedges : function(inData, outData, width, height, options, progress) {
            var n = width * height * 4,
                i,
                data1 = [], 
                data2 = [],
                gr1, gr2, gg1, gg2, gb1, gb2,
                prog, lastProg = 0,
                convProgress1, convProgress2;

            if (progress) {
                convProgress1 = function(p) {
                    progress(p * 0.4);
                    return p;
                };
                convProgress2 = function(p) {
                    progress(0.4 + p * 0.4);
                    return p;
                };
            }
            
            convolve3x3(inData, data1, width, height, 
                [[-1, 0, 1],
                 [-2, 0, 2],
                 [-1, 0, 1]]
            );
            convolve3x3(inData, data2, width, height, 
                [[-1, -2, -1],
                 [ 0,  0,  0],
                 [ 1,  2,  1]]
            );
            
            for (i=0;i<n;i+=4) {
                gr1 = data1[i];
                gr2 = data2[i];
                gg1 = data1[i+1];
                gg2 = data2[i+1];
                gb1 = data1[i+2];
                gb2 = data2[i+2];
                
                if (gr1 < 0) gr1 = -gr1;
                if (gr2 < 0) gr2 = -gr2;
                if (gg1 < 0) gg1 = -gg1;
                if (gg2 < 0) gg2 = -gg2;
                if (gb1 < 0) gb1 = -gb1;
                if (gb2 < 0) gb2 = -gb2;
            
                outData[i] = 255 - (gr1 + gr2) * 0.8;
                outData[i+1] = 255 - (gg1 + gg2) * 0.8;
                outData[i+2] = 255 - (gb1 + gb2) * 0.8;
                outData[i+3] = inData[i+3];
                
                if (progress) {
                    prog = 0.8 + (i/n*100 >> 0) / 100 * 0.2;
                    if (prog > lastProg) {
                        lastProg = progress(prog);
                    }
                }
            }
        },
        
        // A 3x3 edge enhance
        edgeenhance3x3 : function(inData, outData, width, height, options, progress) {
            convolve3x3(
                inData, outData, width, height, 
                [[-1/9, -1/9, -1/9],
                 [-1/9,  17/9, -1/9],
                 [-1/9, -1/9, -1/9]],
                progress
            );
        },
        
        // A 5x5 edge enhance
        edgeenhance5x5 : function(inData, outData, width, height, options, progress) {
            convolve5x5(
                inData, outData, width, height, 
                [[-1/25, -1/25, -1/25, -1/25, -1/25],
                 [-1/25, -1/25, -1/25, -1/25, -1/25],
                 [-1/25, -1/25, 49/25, -1/25, -1/25],
                 [-1/25, -1/25, -1/25, -1/25, -1/25],
                 [-1/25, -1/25, -1/25, -1/25, -1/25]],
                progress
            );
        },

        // A 3x3 Laplacian edge-detect
        laplace3x3 : function(inData, outData, width, height, options, progress) {
            convolve3x3(
                inData, outData, width, height, 
                [[-1, -1, -1],
                 [-1,  8, -1],
                 [-1, -1, -1]],
                progress,
                false, true, true
            );
        },
        
        // A 5x5 Laplacian edge-detect
        laplace5x5 : function(inData, outData, width, height, options, progress) {
            convolve5x5(
                inData, outData, width, height, 
                [[-1, -1, -1, -1, -1],
                 [-1, -1, -1, -1, -1],
                 [-1, -1, 24, -1, -1],
                 [-1, -1, -1, -1, -1],
                 [-1, -1, -1, -1, -1]],
                progress,
                false, true, true
            );
        },
        
        coloradjust : function(inData, outData, width, height, options, progress) {
            var n = width * height * 4,
                r, g, b,
                prog, lastProg = 0,
                ar = clamp(options.r, -1, 1) * 255,
                ag = clamp(options.g, -1, 1) * 255,
                ab = clamp(options.b, -1, 1) * 255;

            for (var i=0;i<n;i+=4) {
                r = inData[i] + ar;
                g = inData[i+1] + ag;
                b = inData[i+2] + ab;
                if (r < 0) r = 0;
                if (g < 0) g = 0;
                if (b < 0) b = 0;
                if (r > 255) r = 255;
                if (g > 255) g = 255;
                if (b > 255) b = 255;
                outData[i] = r;
                outData[i+1] = g;
                outData[i+2] = b;
                outData[i+3] = inData[i+3];
                
                if (progress) {
                    prog = (i/n*100 >> 0) / 100;
                    if (prog > lastProg) {
                        lastProg = progress(prog);
                    }
                }
            }
        },
        
        colorfilter : function(inData, outData, width, height, options, progress) {
            var n = width * height * 4,
                i, r, g, b,
                luminosity = !!options.luminosity,
                prog, lastProg = 0,
                min, max, h, l, h1, chroma, tmp, m,
                ar = clamp(options.r, 0, 1),
                ag = clamp(options.g, 0, 1),
                ab = clamp(options.b, 0, 1);
                
            for (i=0;i<n;i+=4) {
                r = inData[i] / 255;
                g = inData[i+1] / 255;
                b = inData[i+2] / 255;
                
                l = r * 0.3 + g * 0.59 + b * 0.11;
                    
                r = (r + r * ar) / 2;
                g = (g + g * ag) / 2;
                b = (b + b * ab) / 2;

                if (luminosity) {
                    min = max = r;
                    if (g > max) max = g;
                    if (b > max) max = b;
                    if (g < min) min = g;
                    if (b < min) min = b;
                    chroma = (max - min);

                    if (r == max) {
                        h = ((g - b) / chroma) % 6;
                    } else if (g == max) {
                        h = ((b - r) / chroma) + 2;
                    } else {
                        h = ((r - g) / chroma) + 4;
                    }

                    h1 = h >> 0;
                    tmp = chroma * (h - h1);
                    r = g = b = l - (r * 0.3 + g * 0.59 + b * 0.11);
                        
                    if (h1 == 0) {
                        r += chroma; 
                        g += tmp;
                    } else if (h1 == 1) {
                        r += chroma - tmp;
                        g += chroma;
                    } else if (h1 == 2) {
                        g += chroma;
                        b += tmp;
                    } else if (h1 == 3) {
                        g += chroma - tmp;
                        b += chroma;
                    } else if (h1 == 4) {
                        r += tmp;
                        b += chroma;
                    } else if (h1 == 5) {
                        r += chroma;
                        b += chroma - tmp;
                    }
                }

                outData[i] = r * 255;
                outData[i+1] = g * 255;
                outData[i+2] = b * 255;
                outData[i+3] = inData[i+3];
                
                if (progress) {
                    prog = (i/n*100 >> 0) / 100;
                    if (prog > lastProg) {
                        lastProg = progress(prog);
                    }
                }
            }
        },
        
        hsl : function(inData, outData, width, height, options, progress) {
            var n = width * height * 4,
                hue = clamp(options.hue, -1, 1),
                saturation = clamp(options.saturation, -1, 1),
                lightness = clamp(options.lightness, -1, 1),
                satMul = 1 + saturation * (saturation < 0 ? 1 : 2),
                lightMul = lightness < 0 ? 1 + lightness : 1 - lightness,
                lightAdd = lightness < 0 ? 0 : lightness * 255,
                vs, ms, vm, h, s, l, v, m, vmh, sextant,
                prog, lastProg = 0;

            hue = (hue * 6) % 6;
                    
            for (var i=0;i<n;i+=4) {

                r = inData[i];
                g = inData[i+1];
                b = inData[i+2];
                
                if (hue != 0 || saturation != 0) {
                    // ok, here comes rgb to hsl + adjust + hsl to rgb, all in one jumbled mess. 
                    // It's not so pretty, but it's been optimized to get somewhat decent performance.
                    // The transforms were originally adapted from the ones found in Graphics Gems, but have been heavily modified.
                    vs = r;
                    if (g > vs) vs = g;
                    if (b > vs) vs = b;
                    ms = r;
                    if (g < ms) ms = g;
                    if (b < ms) ms = b;
                    vm = (vs-ms);
                    l = (ms+vs)/510;
                    
                    if (l > 0 && vm > 0) {
                        if (l <= 0.5) {
                            s = vm / (vs+ms) * satMul;
                            if (s > 1) s = 1;
                            v = (l * (1+s));
                        } else {
                            s = vm / (510-vs-ms) * satMul;
                            if (s > 1) s = 1;
                            v = (l+s - l*s);
                        }
                        if (r == vs) {
                            if (g == ms) {
                                h = 5 + ((vs-b)/vm) + hue;
                            } else {
                                h = 1 - ((vs-g)/vm) + hue;
                            }
                        } else if (g == vs) {
                            if (b == ms) {
                                h = 1 + ((vs-r)/vm) + hue;
                            } else {
                                h = 3 - ((vs-b)/vm) + hue;
                            }
                        } else {
                            if (r == ms) {
                                h = 3 + ((vs-g)/vm) + hue;
                            } else {
                                h = 5 - ((vs-r)/vm) + hue;
                            }
                        }
                        if (h < 0) h += 6;
                        if (h >= 6) h -= 6;
                        m = (l + l - v);
                        sextant = h >> 0;
                        vmh = (v - m) * (h - sextant);
                        if (sextant == 0) {
                            r = v; 
                            g = m + vmh;
                            b = m;
                        } else if (sextant == 1) {
                            r = v - vmh;
                            g = v;
                            b = m;
                        } else if (sextant == 2) {
                            r = m;
                            g = v;
                            b = m + vmh;
                        } else if (sextant == 3) {
                            r = m;
                            g = v - vmh;
                            b = v;
                        } else if (sextant == 4) {
                            r = m + vmh;
                            g = m;
                            b = v;
                        } else if (sextant == 5) {
                            r = v;
                            g = m;
                            b = v - vmh;
                        }
                        
                        r *= 255;
                        g *= 255;
                        b *= 255;
                    }
                }
                
                r = r * lightMul + lightAdd;
                g = g * lightMul + lightAdd;
                b = b * lightMul + lightAdd;
                
                if (r < 0) r = 0;
                if (g < 0) g = 0;
                if (b < 0) b = 0;
                if (r > 255) r = 255;
                if (g > 255) g = 255;
                if (b > 255) b = 255;
                
                outData[i] = r;
                outData[i+1] = g;
                outData[i+2] = b;
                outData[i+3] = inData[i+3];
                
                if (progress) {
                    prog = (i/n*100 >> 0) / 100;
                    if (prog > lastProg) {
                        lastProg = progress(prog);
                    }
                }
            }
        },
        
        posterize : function(inData, outData, width, height, options, progress) {
            var numLevels = clamp(options.levels, 2, 256),
                numAreas = 256 / numLevels,
                numValues = 256 / (numLevels-1),
                r, g, b,
                n = width * height * 4,
                prog, lastProg = 0;

            for (i=0;i<n;i+=4) {
            
                outData[i] = numValues * ((inData[i] / numAreas)>>0);
                outData[i+1] = numValues * ((inData[i+1] / numAreas)>>0); 
                outData[i+2] = numValues * ((inData[i+2] / numAreas)>>0); 
            
                outData[i+3] = inData[i+3];

                if (progress) {
                    prog = (i/n*100 >> 0) / 100;
                    if (prog > lastProg) {
                        lastProg = progress(prog);
                    }
                }
            }
            
        },
        
        removenoise : function(inData, outData, width, height, options, progress) {
            var r, g, b, c, y, x, idx,
                pyc, pyp, pyn,
                pxc, pxp, pxn,
                minR, minG, minB, maxR, maxG, maxB,
                n, prog, lastProg = 0;
                
            n = width * height * 4;
                
            for (y=0;y<height;++y) {
                pyc = y * width * 4;
                pyp = pyc - width * 4;
                pyn = pyc + width * 4;

                if (y < 1) pyp = pyc;
                if (y >= width-1) pyn = pyc;
                
                for (x=0;x<width;++x) {
                    idx = (y * width + x) * 4;
                    
                    pxc = x * 4;
                    pxp = pxc - 4;
                    pxn = pxc + 4;
              
                    if (x < 1) pxp = pxc;
                    if (x >= width-1) pxn = pxc;
                    
                    minR = maxR = inData[pyc + pxp];
                    c = inData[pyc + pxn];
                    if (c < minR) minR = c;
                    if (c > maxR) maxR = c;
                    c = inData[pyp + pxc];
                    if (c < minR) minR = c;
                    if (c > maxR) maxR = c;
                    c = inData[pyn + pxc];
                    if (c < minR) minR = c;
                    if (c > maxR) maxR = c;

                    minG = inData[pyc + pxp + 1];
                    c = inData[pyc + pxn + 1];
                    if (c < minG) minG = c;
                    c = inData[pyp + pxc + 1];
                    if (c < minG) minG = c;
                    c = inData[pyn + pxc + 1];
                    if (c < minG) minG = c;
                    
                    minB = inData[pyc + pxp + 2];
                    c = inData[pyc + pxn + 2];
                    if (c < minB) minB = c;
                    c = inData[pyp + pxc + 2];
                    if (c < minB) minB = c;
                    c = inData[pyn + pxc + 2];
                    if (c < minB) minB = c;

                    r = inData[idx]
                    g = inData[idx + 1]
                    b = inData[idx + 2]
                    
                    if (r < minR) r = minR;
                    if (r > maxR) r = maxR;
                    if (g < minG) g = minG;
                    if (g > maxG) g = maxG;
                    if (b < minB) b = minB;
                    if (b > maxB) b = maxB;
                    
                    outData[idx] = r;
                    outData[idx+1] = g;
                    outData[idx+2] = b;
                    outData[idx+3] = inData[idx+3];
                    
                    if (progress) {
                        prog = (idx/n*100 >> 0) / 100;
                        if (prog > lastProg) {
                            lastProg = progress(prog);
                        }
                    }
                }
            }
        }
        
    };

})();
Pixastic.Worker = function() {
    var me = this;
    function processMessage(data) {
        var queue = data.queue,
            inData = data.inData,
            outData = data.outData,
            width = data.width,
            height = data.height,
            tmpData;

        for (var i=0;i<queue.length;i++) {
            var e = queue[i].effect,
                options = queue[i].options;

            if (i > 0) {
                tmpData = inData;
                inData = outData;
                outData = tmpData;
            }

            Pixastic.Effects[e](inData.data, outData.data, width, height, options);
            
            me.onmessage({
                data : {
                    event : "progress",
                    data : (i+1) / queue.length
                }
            });
        }
       
        me.onmessage({
            data : {
                event : "done",
                data : outData
            }
        });
    }

    this.postMessage = function(data) {
        setTimeout(function() {
            processMessage(data)
        }, 0);
    }
    
    this.onmessage = function() {};

}
// lib/handlebars/base.js
/*jshint eqnull:true*/this.Handlebars={},function(e){e.VERSION="1.0.rc.1",e.helpers={},e.partials={},e.registerHelper=function(e,t,n){n&&(t.not=n),this.helpers[e]=t},e.registerPartial=function(e,t){this.partials[e]=t},e.registerHelper("helperMissing",function(e){if(arguments.length===2)return undefined;throw new Error("Could not find property '"+e+"'")});var t=Object.prototype.toString,n="[object Function]";e.registerHelper("blockHelperMissing",function(r,i){var s=i.inverse||function(){},o=i.fn,u="",a=t.call(r);return a===n&&(r=r.call(this)),r===!0?o(this):r===!1||r==null?s(this):a==="[object Array]"?r.length>0?e.helpers.each(r,i):s(this):o(r)}),e.K=function(){},e.createFrame=Object.create||function(t){e.K.prototype=t;var n=new e.K;return e.K.prototype=null,n},e.registerHelper("each",function(t,n){var r=n.fn,i=n.inverse,s=0,o="",u;n.data&&(u=e.createFrame(n.data));if(t&&typeof t=="object")if(t instanceof Array)for(var a=t.length;s<a;s++)u&&(u.index=s),o+=r(t[s],{data:u});else for(var f in t)t.hasOwnProperty(f)&&(u&&(u.key=f),o+=r(t[f],{data:u}),s++);return s===0&&(o=i(this)),o}),e.registerHelper("if",function(r,i){var s=t.call(r);return s===n&&(r=r.call(this)),!r||e.Utils.isEmpty(r)?i.inverse(this):i.fn(this)}),e.registerHelper("unless",function(t,n){var r=n.fn,i=n.inverse;return n.fn=i,n.inverse=r,e.helpers["if"].call(this,t,n)}),e.registerHelper("with",function(e,t){return t.fn(e)}),e.registerHelper("log",function(t){e.log(t)})}(this.Handlebars);var errorProps=["description","fileName","lineNumber","message","name","number","stack"];Handlebars.Exception=function(e){var t=Error.prototype.constructor.apply(this,arguments);for(var n=0;n<errorProps.length;n++)this[errorProps[n]]=t[errorProps[n]]},Handlebars.Exception.prototype=new Error,Handlebars.SafeString=function(e){this.string=e},Handlebars.SafeString.prototype.toString=function(){return this.string.toString()},function(){var e={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#x27;","`":"&#x60;"},t=/[&<>"'`]/g,n=/[&<>"'`]/,r=function(t){return e[t]||"&amp;"};Handlebars.Utils={escapeExpression:function(e){return e instanceof Handlebars.SafeString?e.toString():e==null||e===!1?"":n.test(e)?e.replace(t,r):e},isEmpty:function(e){return typeof e=="undefined"?!0:e===null?!0:e===!1?!0:Object.prototype.toString.call(e)==="[object Array]"&&e.length===0?!0:!1}}}(),Handlebars.VM={template:function(e){var t={escapeExpression:Handlebars.Utils.escapeExpression,invokePartial:Handlebars.VM.invokePartial,programs:[],program:function(e,t,n){var r=this.programs[e];return n?Handlebars.VM.program(t,n):r?r:(r=this.programs[e]=Handlebars.VM.program(t),r)},programWithDepth:Handlebars.VM.programWithDepth,noop:Handlebars.VM.noop};return function(n,r){return r=r||{},e.call(t,Handlebars,n,r.helpers,r.partials,r.data)}},programWithDepth:function(e,t,n){var r=Array.prototype.slice.call(arguments,2);return function(n,i){return i=i||{},e.apply(this,[n,i.data||t].concat(r))}},program:function(e,t){return function(n,r){return r=r||{},e(n,r.data||t)}},noop:function(){return""},invokePartial:function(e,t,n,r,i,s){var o={helpers:r,partials:i,data:s};if(e===undefined)throw new Handlebars.Exception("The partial "+t+" could not be found");if(e instanceof Function)return e(n,o);if(!Handlebars.compile)throw new Handlebars.Exception("The partial "+t+" could not be compiled when running in runtime-only mode");return i[t]=Handlebars.compile(e,{data:s!==undefined}),i[t](n,o)}},Handlebars.template=Handlebars.VM.template;(function() {
  var template = Handlebars.template, templates = Handlebars.templates = Handlebars.templates || {};
templates['loadingOverlay'] = template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [2,'>= 1.0.0-rc.3'];
helpers = helpers || Handlebars.helpers; data = data || {};
  


  return "\n<div id=\"cb-loading-overlay\" class=\"cb-control\"></div>\n";
  });
templates['navigateLeft'] = template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [2,'>= 1.0.0-rc.3'];
helpers = helpers || Handlebars.helpers; data = data || {};
  


  return "\n<div data-trigger=\"click\" data-action=\"navigation\" data-navigate-side=\"left\" class=\"cb-control navigate navigate-left \">\n	<span class=\"icon-arrow-left\"></span>\n</div>\n";
  });
templates['navigateRight'] = template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [2,'>= 1.0.0-rc.3'];
helpers = helpers || Handlebars.helpers; data = data || {};
  


  return "\n<div data-trigger=\"click\" data-action=\"navigation\" data-navigate-side=\"right\" class=\"cb-control navigate navigate-right\">\n	<span class=\"icon-arrow-right\"></span>\n</div>\n";
  });
templates['progressbar'] = template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [2,'>= 1.0.0-rc.3'];
helpers = helpers || Handlebars.helpers; data = data || {};
  


  return "<div id=\"cb-status\" class=\"cb-control\">\n	<div id=\"cb-progress-bar\">\n		<div class=\"progressbar-value\"></div>\n	</div>\n</div>\n";
  });
templates['toolbar'] = template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [2,'>= 1.0.0-rc.3'];
helpers = helpers || Handlebars.helpers; data = data || {};
  


  return "\n<div class=\"toolbar\">\n\n	<ul class=\"pull-left\">\n		<li class=\"close\">\n			<button data-trigger=\"click\" data-action=\"close\" title=\"close\" class=\"icon-remove-sign\"></button>\n		</li>\n		<li class=\"close separator\"></li>\n		<li>\n			<button title=\"image settings\" class=\"icon-settings\" data-toggle=\"dropdown\"></button>\n			<div class=\"dropdown\">\n				<form name=\"image-enhancements\" data-trigger=\"reset\" data-action=\"resetEnhancements\">\n					<div class=\"sliders\">\n						<div class=\"control-group\">\n							<label title=\"adjust brightness\" class=\"icon-sun\"></label>\n							<input data-trigger=\"change\" data-action=\"brightness\" type=\"range\" min=\"-100\" max=\"100\" step=\"1\" value=\"0\">\n						</div>\n						<div class=\"control-group\">\n							<label title=\"adjust contrast\" class=\"icon-adjust\"></label>\n							<input data-trigger=\"change\" data-action=\"contrast\" type=\"range\" min=\"-1\" max=\"1\" step=\"0.1\" value=\"0\">\n						</div>\n						<div class=\"control-group\">\n							<label title=\"sharpen\" class=\"icon-droplet\"></label>\n							<input data-trigger=\"change\" data-action=\"sharpen\" type=\"range\" min=\"0\" max=\"1\" step=\"0.1\" value=\"0\">\n						</div>\n					</div>\n					<div class=\"control-group pull-left\">\n						<input id=\"image-desaturate\" type=\"checkbox\" data-trigger=\"change\" data-action=\"desaturate\">\n						<label for=\"image-desaturate\">desaturate</label>\n					</div>\n					<div class=\"control-group pull-right\">\n						<input type=\"reset\" value=\"reset\">\n					</div>\n				</form>\n			</div>\n		</li>\n		<li>\n			<button data-trigger=\"click\" data-action=\"toggleLayout\" title=\"toggle one/two pages at a time\" class=\"icon-file layout layout-single\"></button>\n			<button data-trigger=\"click\" data-action=\"toggleLayout\" title=\"toggle one/two pages at a time\" class=\"icon-copy layout layout-double\"></button>\n		</li>\n		<li>\n			<button data-trigger=\"click\" data-action=\"zoomOut\" title=\"zoom out\" class=\"icon-zoom-out\"></button>\n		</li>\n		<li>\n			<button data-trigger=\"click\" data-action=\"zoomIn\" title=\"zoom in\" class=\"icon-zoom-in\"></button>\n		</li>\n		<li>\n			<button data-trigger=\"click\" data-action=\"fitWidth\" title=\"fit page to window width\" class=\"icon-expand\"></button>\n		</li>\n		<li>\n			<button data-trigger=\"click\" data-action=\"fitWindow\" title=\"fit page to window\" class=\"icon-expand-2\"></button>\n		</li>\n		<li>\n			<button data-trigger=\"click\" data-action=\"toggleReadingMode\" title=\"switch reading direction\" class=\"icon-arrow-right-3 manga-false\"></button>\n			<button data-trigger=\"click\" data-action=\"toggleReadingMode\" title=\"switch reading direction\" class=\"icon-arrow-left-3 manga-true\"></button>\n		</li>\n	</ul>\n\n	<ul class=\"pull-right\">\n		<li><span id=\"current-page\"></span> / <span id=\"page-count\"></span></li>\n	</ul>\n\n</div>\n";
  });
})();/* exported ComicBook */

var ComicBook = (function ($) {

  'use strict';

  /**
   * Merge two arrays. Any properties in b will replace the same properties in
   * a. New properties from b will be added to a.
   *
   * @param a {Object}
   * @param b {Object}
   */
  function merge(a, b) {

    var prop;

    if (typeof b === 'undefined') { b = {}; }

    for (prop in a) {
      if (a.hasOwnProperty(prop)) {
        if (prop in b) { continue; }
        b[prop] = a[prop];
      }
    }

    return b;
  }

  /**
   * Exception class. Always throw an instance of this when throwing exceptions.
   *
   * @param {String} type
   * @param {Object} object
   * @returns {ComicBookException}
   */
  var ComicBookException = {
    INVALID_ACTION: 'invalid action',
    INVALID_PAGE: 'invalid page',
    INVALID_PAGE_TYPE: 'invalid page type',
    UNDEFINED_CONTROL: 'undefined control',
    INVALID_ZOOM_MODE: 'invalid zoom mode',
    INVALID_NAVIGATION_EVENT: 'invalid navigation event'
  };

  function ComicBook(id, srcs, opts) {

    var self = this;
    var canvas_id = id;   // canvas element id
    this.srcs = srcs; // array of image srcs for pages

    var defaults = {
      displayMode: 'double',  // single / double
      zoomMode: 'fitWindow', // manual / fitWidth / fitWindow
      manga: false,     // true / false
      enhance: {},
      keyboard: {
        next: 78,
        previous: 80,
        toolbar: 84,
        toggleLayout: 76
      },
      libPath: '/lib/',
      forward_buffer: 3
    };

    this.isMobile = false;

    // mobile enhancements
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent)) {
      this.isMobile = true;
      document.body.classList.add('mobile');
      defaults.displayMode = 'single';

      window.addEventListener('load', function () {
        setTimeout(function () {
          window.scrollTo(0, 1);
        }, 0);
      });
    }

    var options = merge(defaults, opts); // options array for internal use

    var no_pages = srcs.length;
    var pages = [];   // array of preloaded Image objects
    var canvas;     // the HTML5 canvas object
    var context;    // the 2d drawing context
    var loaded = [];  // the images that have been loaded so far
    var scale = 1;    // page zoom scale, 1 = 100%
    var is_double_page_spread = false;
    var controlsRendered = false; // have the user controls been inserted into the dom yet?
    var page_requested = false; // used to request non preloaded pages
    var shiv = false;

    /**
     * Gets the window.innerWidth - scrollbars
     */
    function windowWidth() {

      var height = window.innerHeight + 1;

      if (shiv === false) {
        shiv = $(document.createElement('div'))
          .attr('id', 'cb-width-shiv')
          .css({
            width: '100%',
            position: 'absolute',
            top: 0,
            zIndex: '-1000'
          });

        $('body').append(shiv);
      }

      shiv.height(height);

      return shiv.innerWidth();
    }

    /**
     * enables the back button
     */
    function checkHash() {

      var hash = getHash();

      if (hash !== pointer && loaded.indexOf(hash) > -1) {
        pointer = hash;
        self.draw();
      }
    }

    function getHash() {
      var hash = parseInt(location.hash.substring(1),10) - 1 || 0;
      if (hash < 0) {
        setHash(0);
        hash = 0;
      }
      return hash;
    }

    function setHash(pageNo) {
      location.hash = pageNo;
    }

    // page hash on first load
    var hash = getHash();

    // the current page, can pass a default as a url hash
    var pointer = (hash < srcs.length) ? hash : 0;

    /**
     * Setup the canvas element for use throughout the class.
     *
     * @see #ComicBook.prototype.draw
     * @see #ComicBook.prototype.enhance
     */
    function init() {

      // setup canvas
      canvas = document.getElementById(canvas_id);
      context = canvas.getContext('2d');

      // render user controls
      if (controlsRendered === false) {
        self.renderControls();
        controlsRendered = true;
      }

      // add page controls
      window.addEventListener('keydown', self.navigation, false);
      window.addEventListener('hashchange', checkHash, false);
    }

    window.addEventListener('touchstart', function (e) {
      var $el = $(e.target);
      if ($el.attr('id') === 'comic') {
        self.toggleToolbar();
      }
      if ($el.data('toggle') === 'dropdown' ) {
        $el.siblings('.dropdown').toggle();
      }
    }, false);

    /**
     * Render Handlebars templates. Templates with data-trigger & data-action will
     * have the specified events bound.
     */
    ComicBook.prototype.renderControls = function () {

      var controls = {}, $toolbar;

      $.each(Handlebars.templates, function (name, template) {

        var $template = $(template().trim());
        controls[name] = $template;

        // add event listeners to controls that specify callbacks
        $template.find('*').andSelf().filter('[data-action][data-trigger]').each(function () {

          var $this = $(this);
          var trigger = $this.data('trigger');
          var action = $this.data('action');

          // trigger a direct method if exists
          if (typeof self[$this.data('action')] === 'function') {
            $this.on(trigger, self[action]);
          }

          // throw an event to be caught outside if the app code
          $this.on(trigger, function (e) {
            $(self).trigger(trigger, e);
          });
        });

        $(canvas).before($template);
      });

      this.controls = controls;

      $toolbar = this.getControl('toolbar');
      $toolbar
        .find('.manga-' + options.manga).show().end()
        .find('.manga-' + !options.manga).hide().end()
        .find('.layout').hide().end().find('.layout-' + options.displayMode).show();

    };

    ComicBook.prototype.getControl = function (control) {
      if (typeof this.controls[control] !== 'object') {
        throw ComicBookException.UNDEFINED_CONTROL + ' ' + control;
      }
      return this.controls[control];
    };

    ComicBook.prototype.showControl = function (control) {
      this.getControl(control).show().addClass('open');
    };

    ComicBook.prototype.hideControl = function (control) {
      this.getControl(control).removeClass('open').hide();
    };

    ComicBook.prototype.toggleControl = function (control) {
      this.getControl(control).toggle().toggleClass('open');
    };

    ComicBook.prototype.toggleLayout = function() {

      var $toolbar = self.getControl('toolbar');
      var displayMode = (options.displayMode === 'single') ? 'double' : 'single';

      options.displayMode = displayMode;

      $toolbar.find('.layout').hide().end().find('.layout-' + options.displayMode).show();

      self.drawPage();
    };

    /**
     * Get the image for a given page.
     *
     * @return Image
     */
    ComicBook.prototype.getPage = function (i) {

      if (i < 0 || i > srcs.length-1) {
        throw ComicBookException.INVALID_PAGE + ' ' + i;
      }

      if (typeof pages[i] === 'object') {
        return pages[i];
      } else {
        page_requested = i;
        this.showControl('loadingOverlay');
      }
    };

    /**
     * @see #preload
     */
    ComicBook.prototype.draw = function () {

      init();

      // resize navigation controls
      $('.navigate').outerHeight(window.innerHeight);
      $('#cb-loading-overlay').outerWidth(windowWidth()).height(window.innerHeight);

      // preload images if needed
      if (pages.length !== no_pages) {
        this.preload();
      } else {
        this.drawPage();
      }
    };

    /**
     * Zoom the canvas
     *
     * @param new_scale {Number} Scale the canvas to this ratio
     */
    ComicBook.prototype.zoom = function (new_scale) {
      options.zoomMode = 'manual';
      scale = new_scale;
      if (typeof this.getPage(pointer) === 'object') { this.drawPage(); }
    };

    ComicBook.prototype.zoomIn = function () {
      self.zoom(scale + 0.1);
    };

    ComicBook.prototype.zoomOut = function () {
      self.zoom(scale - 0.1);
    };

    ComicBook.prototype.fitWidth = function () {
      options.zoomMode = 'fitWidth';
      self.drawPage();
    };

    ComicBook.prototype.fitWindow = function () {
      options.zoomMode = 'fitWindow';
      self.drawPage();
    };

    /**
     * Preload all images, draw the page only after a given number have been loaded.
     *
     * @see #drawPage
     */
    ComicBook.prototype.preload = function () {

      var i = pointer; // the current page counter for this method
      var rendered = false;
      var queue = [];

      this.showControl('loadingOverlay');

      function loadImage(i) {

        var page = new Image();
        page.src = srcs[i];

        page.onload = function () {

          pages[i] = this;
          loaded.push(i);

          $('#cb-progress-bar .progressbar-value').css('width', Math.floor((loaded.length / no_pages) * 100) + '%');

          // double page mode needs an extra page added
          var buffer = (options.displayMode === 'double' && pointer < srcs.length-1) ? 1 : 0;

          // start rendering the comic when the requested page is ready
          if ((rendered === false && ($.inArray(pointer + buffer, loaded) !== -1) ||
              (typeof page_requested === 'number' && $.inArray(page_requested, loaded) !== -1))
          ) {
            // if the user is waiting for a page to be loaded, render that one instead of the default pointer
            if (typeof page_requested === 'number') {
              pointer = page_requested-1;
              page_requested = false;
            }

            self.drawPage();
            self.hideControl('loadingOverlay');
            rendered = true;
          }

          if (queue.length) {
            loadImage(queue[0]);
            queue.splice(0,1);
          } else {
            $('#cb-status').delay(500).fadeOut();
          }
        };
      }

      // loads pages in both directions so you don't have to wait for all pages
      // to be loaded before you can scroll backwards
      function preload(start, stop) {

        var j = 0;
        var count = 1;
        var forward = start;
        var backward = start-1;

        while (forward <= stop) {

          if (count > options.forward_buffer && backward > -1) {
            queue.push(backward);
            backward--;
            count = 0;
          } else {
            queue.push(forward);
            forward++;
          }
          count++;
        }

        while (backward > -1) {
          queue.push(backward);
          backward--;
        }

        loadImage(queue[j]);
      }

      preload(i, srcs.length-1);
    };

    ComicBook.prototype.pageLoaded = function (page_no) {
      return (typeof loaded[page_no-1] !== 'undefined');
    };

    /**
     * Draw the current page in the canvas
     */
    ComicBook.prototype.drawPage = function(page_no, reset_scroll) {

      var scrollY;

      reset_scroll = (typeof reset_scroll !== 'undefined') ? reset_scroll : true;
      scrollY = reset_scroll ? 0 : window.scrollY;

      // if a specific page is given try to render it, if not bail and wait for preload() to render it
      if (typeof page_no === 'number' && page_no < srcs.length && page_no > 0) {
        pointer = page_no-1;
        if (!this.pageLoaded(page_no)) {
          this.showControl('loadingOverlay');
          return;
        }
      }

      if (pointer < 0) { pointer = 0; }

      var zoom_scale;
      var offsetW = 0, offsetH = 0;

      var page = self.getPage(pointer);
      var page2 = false;

      if (options.displayMode === 'double' && pointer < srcs.length-1) {
        page2 = self.getPage(pointer + 1);
      }

      if (typeof page !== 'object') {
        throw ComicBookException.INVALID_PAGE_TYPE + ' ' + typeof page;
      }

      var width = page.width, height = page.height;

      // reset the canvas to stop duplicate pages showing
      canvas.width = 0;
      canvas.height = 0;

      // show double page spreads on a single page
      is_double_page_spread = (
        typeof page2 === 'object' &&
        (page.width > page.height || page2.width > page2.height) &&
        options.displayMode === 'double'
      );
      if (is_double_page_spread) { options.displayMode = 'single'; }

      if (options.displayMode === 'double') {

        // for double page spreads, factor in the width of both pages
        if (typeof page2 === 'object') { width += page2.width; }

        // if this is the last page and there is no page2, still keep the canvas wide
        else { width += width; }
      }

      // update the page scale if a non manual mode has been chosen
      switch (options.zoomMode) {

      case 'manual':
        document.body.style.overflowX = 'auto';
        zoom_scale = (options.displayMode === 'double') ? scale * 2 : scale;
        break;

      case 'fitWidth':
        document.body.style.overflowX = 'hidden';

        // scale up if the window is wider than the page, scale down if the window
        // is narrower than the page
        zoom_scale = (windowWidth() > width) ? ((windowWidth() - width) / windowWidth()) + 1 : windowWidth() / width;

        // update the interal scale var so switching zoomModes while zooming will be smooth
        scale = zoom_scale;
        break;

      case 'fitWindow':
        document.body.style.overflowX = 'hidden';

        var width_scale = (windowWidth() > width) ?
          ((windowWidth() - width) / windowWidth()) + 1 // scale up if the window is wider than the page
          : windowWidth() / width; // scale down if the window is narrower than the page
        var windowHeight = window.innerHeight;
        var height_scale = (windowHeight > height) ?
          ((windowHeight - height) / windowHeight) + 1 // scale up if the window is wider than the page
          : windowHeight / height; // scale down if the window is narrower than the page

        zoom_scale = (width_scale > height_scale) ? height_scale : width_scale;
        scale = zoom_scale;
        break;

      default:
        throw ComicBookException.INVALID_ZOOM_MODE + ' ' + options.zoomMode;
      }

      var canvas_width  = page.width * zoom_scale;
      var canvas_height = page.height * zoom_scale;

      var page_width = (options.zoomMode === 'manual') ? page.width * scale : canvas_width;
      var page_height = (options.zoomMode === 'manual') ? page.height * scale : canvas_height;

      canvas_height = page_height;

      // make sure the canvas is always at least full screen, even if the page is more narrow than the screen
      canvas.width = (canvas_width < windowWidth()) ? windowWidth() : canvas_width;
      canvas.height = (canvas_height < window.innerHeight) ? window.innerHeight : canvas_height;

      // always keep pages centered
      if (options.zoomMode === 'manual' || options.zoomMode === 'fitWindow') {

        // work out a horizontal position
        if (canvas_width < windowWidth()) {
          offsetW = (windowWidth() - page_width) / 2;
          if (options.displayMode === 'double') { offsetW = offsetW - page_width / 2; }
        }

        // work out a vertical position
        if (canvas_height < window.innerHeight) {
          offsetH = (window.innerHeight - page_height) / 2;
        }
      }

      // in manga double page mode reverse the page(s)
      if (options.manga && options.displayMode === 'double' && typeof page2 === 'object') {
        var tmpPage = page;
        var tmpPage2 = page2;
        page = tmpPage2;
        page2 = tmpPage;
      }

      // draw the page(s)
      context.drawImage(page, offsetW, offsetH, page_width, page_height);
      if (options.displayMode === 'double' && typeof page2 === 'object') {
        context.drawImage(page2, page_width + offsetW, offsetH, page_width, page_height);
      }

      this.pixastic = new Pixastic(context, options.libPath + 'pixastic/');

      // apply any image enhancements previously defined
      $.each(options.enhance, function(action, options) {
        self.enhance[action](options);
      });

      var current_page =
        (options.displayMode === 'double' &&
          pointer + 2 <= srcs.length) ? (pointer + 1) + '-' + (pointer + 2) : pointer + 1;

      this.getControl('toolbar')
        .find('#current-page').text(current_page)
        .end()
        .find('#page-count').text(srcs.length);

      // revert page mode back to double if it was auto switched for a double page spread
      if (is_double_page_spread) { options.displayMode = 'double'; }

      // disable the fit width button if needed
      $('button.cb-fit-width').attr('disabled', (options.zoomMode === 'fitWidth'));
      $('button.cb-fit-window').attr('disabled', (options.zoomMode === 'fitWindow'));

      // disable prev/next buttons if not needed
      $('.navigate').show();
      if (pointer === 0) {
        if (options.manga) {
          $('.navigate-left').show();
          $('.navigate-right').hide();
        } else {
          $('.navigate-left').hide();
          $('.navigate-right').show();
        }
      }

      if (pointer === srcs.length-1 || (typeof page2 === 'object' && pointer === srcs.length-2)) {
        if (options.manga) {
          $('.navigate-left').hide();
          $('.navigate-right').show();
        } else {
          $('.navigate-left').show();
          $('.navigate-right').hide();
        }
      }

      if (pointer !== getHash()){
        $(this).trigger('navigate');
      }

      // update hash location
      if (getHash() !== pointer) {
        setHash(pointer + 1);
      }
    };

    /**
     * Increment the counter and draw the page in the canvas
     *
     * @see #drawPage
     */
    ComicBook.prototype.drawNextPage = function () {

      var page;

      try {
        page = self.getPage(pointer+1);
      } catch (e) {}

      if (!page) { return false; }

      if (pointer + 1 < pages.length) {
        pointer += (options.displayMode === 'single' || is_double_page_spread) ? 1 : 2;
        try {
          self.drawPage();
        } catch (e) {}
      }

      // make sure the top of the page is in view
      window.scroll(0, 0);
    };

    /**
     * Decrement the counter and draw the page in the canvas
     *
     * @see #drawPage
     */
    ComicBook.prototype.drawPrevPage = function () {

      var page;

      try {
        page = self.getPage(pointer-1);
      } catch (e) {}

      if (!page) { return false; }

      is_double_page_spread = (page.width > page.height); // need to run double page check again here as we are going backwards

      if (pointer > 0) {
        pointer -= (options.displayMode === 'single' || is_double_page_spread) ? 1 : 2;
        self.drawPage();
      }

      // make sure the top of the page is in view
      window.scroll(0, 0);
    };

    ComicBook.prototype.brightness = function () {
      self.enhance.brightness({ brightness: $(this).val() });
    };

    ComicBook.prototype.contrast = function () {
      self.enhance.brightness({ contrast: $(this).val() });
    };

    ComicBook.prototype.sharpen = function () {
      self.enhance.sharpen({ strength: $(this).val() });
    };

    ComicBook.prototype.desaturate = function () {
      if ($(this).is(':checked')) {
        self.enhance.desaturate();
      } else {
        self.enhance.resaturate();
      }
    };

    ComicBook.prototype.resetEnhancements = function () {
      self.enhance.reset();
    };

    /**
     * Apply image enhancements to the canvas.
     *
     * Powered by the awesome Pixastic: http://www.pixastic.com/
     *
     * TODO: reset & apply all image enhancements each time before applying new one
     * TODO: abstract this into an 'Enhance' object, separate from ComicBook?
     */
    ComicBook.prototype.enhance = {

      /**
       * Reset enhancements.
       * This can reset a specific enhancement if the method name is passed, or
       * it will reset all.
       *
       * @param method {string} the specific enhancement to reset
       */
      reset: function (method) {
        if (!method) {
          options.enhance = {};
        } else {
          delete options.enhance[method];
        }
        self.drawPage(null, false);
      },

      /**
       * Pixastic progress callback
       * @param  {float} progress
       */
      // progress: function (progress) {
      progress: function () {
        // console.info(Math.floor(progress * 100));
      },

      /**
       * Pixastic on complete callback
       */
      done: function () {

      },

      /**
       * Adjust brightness / contrast
       *
       * params
       *    brightness (int) -150 to 150
       *    contrast: (float) -1 to infinity
       *
       * @param {Object} params Brightness & contrast levels
       * @param {Boolean} reset Reset before applying more enhancements?
       */
      brightness: function (params, reset) {

        if (reset !== false) { this.reset('brightness'); }

        // merge user options with defaults
        var opts = merge({ brightness: 0, contrast: 0 }, params);

        // remember options for later
        options.enhance.brightness = opts;

        // run the enhancement
        self.pixastic.brightness({
          brightness: opts.brightness,
          contrast: opts.contrast
        }).done(this.done, this.progress);
      },

      /**
       * Force black and white
       */
      desaturate: function () {
        options.enhance.desaturate = {};
        self.pixastic.desaturate().done(this.done, this.progress);
      },

      /**
       * Undo desaturate
       */
      resaturate: function() {
        delete options.enhance.desaturate;
        self.drawPage(null, false);
      },

      /**
       * Sharpen
       *
       * options:
       *   strength: number (-1 to infinity)
       *
       * @param {Object} options
       */
      sharpen: function (params) {

        this.desharpen();

        var opts = merge({ strength: 0 }, params);

        options.enhance.sharpen = opts;

        self.pixastic.sharpen3x3({
          strength: opts.strength
        }).done(this.done, this.progress);
      },

      desharpen: function() {
        delete options.enhance.sharpen;
        self.drawPage(null, false);
      }
    };

    ComicBook.prototype.navigation = function (e) {

      // disable navigation when the overlay is showing
      if ($('#cb-loading-overlay').is(':visible')) { return false; }

      var side = false;

      switch (e.type) {

      case 'click':
        side = e.currentTarget.getAttribute('data-navigate-side');
        break;

      case 'keydown':

        // navigation
        if (e.keyCode === options.keyboard.previous) { side = 'left'; }
        if (e.keyCode === options.keyboard.next) { side = 'right'; }

        // display controls
        if (e.keyCode === options.keyboard.toolbar) {
          self.toggleToolbar();
        }
        if (e.keyCode === options.keyboard.toggleLayout) {
          self.toggleLayout();
        }
        break;

      default:
        throw ComicBookException.INVALID_NAVIGATION_EVENT + ' ' + e.type;
      }

      if (side) {

        e.stopPropagation();

        // western style (left to right)
        if (!options.manga) {
          if (side === 'left') { self.drawPrevPage(); }
          if (side === 'right') { self.drawNextPage(); }
        }
        // manga style (right to left)
        else {
          if (side === 'left') { self.drawNextPage(); }
          if (side === 'right') { self.drawPrevPage(); }
        }

        return false;
      }
    };

    ComicBook.prototype.toggleReadingMode = function () {
      options.manga = !options.manga;
      self.getControl('toolbar')
        .find('.manga-' + options.manga).show().end()
        .find('.manga-' + !options.manga).hide();
    };

    ComicBook.prototype.toggleToolbar = function () {
      self.toggleControl('toolbar');
    };

    ComicBook.prototype.destroy = function () {

      $.each(this.controls, function (name, $control) {
        $control.remove();
      });

      canvas.width = 0;
      canvas.height = 0;

      window.removeEventListener('keydown', this.navigation, false);
      window.removeEventListener('hashchange', checkHash, false);

      setHash('');

      // $(this).trigger('destroy');
    };

  }

  return ComicBook;

})(jQuery);
