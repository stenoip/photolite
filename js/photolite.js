/**
  Main Application Logic
 */
var PhotoLite = function() {
    // --- State Variables (converted to var) ---
    var self = this;
    
    self.width = 800;
    self.height = 600;
    
    // Display Canvas (What user sees)
    self.displayCanvas = document.getElementById('main-canvas');
    self.displayCtx = self.displayCanvas.getContext('2d');
    
    // State
    self.layers = [];
    self.activeLayerIndex = 0;
    self.history = []; // Array of snapshots
    self.maxHistory = 10;
    
    // Tool State
    self.currentTool = 'brush';
    self.isDrawing = false;
    self.brushSize = 20;
    self.brushColor = '#000000';
    self.brushOpacity = 1.0;
    self.lastX = 0;
    self.lastY = 0;

    // --- Methods ---

    self.init = function() {
        // Initialize Background Layer
        self.addLayer("Background");
        var bg = self.layers[0];
        bg.ctx.fillStyle = "white";
        bg.ctx.fillRect(0, 0, self.width, self.height);
        self.render();
        self.updateLayerUI();

        // Event Listeners
        self.displayCanvas.addEventListener('mousedown', self.startDraw);
        self.displayCanvas.addEventListener('mousemove', self.draw);
        self.displayCanvas.addEventListener('mouseup', self.stopDraw);
        self.displayCanvas.addEventListener('mouseout', self.stopDraw);
        
        // Keyboard Shortcuts
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.key === 'z') {
                e.preventDefault();
                self.undo();
            }
            if (e.key === 'b') self.setTool('brush');
            if (e.key === 'e') self.setTool('eraser');
            if (e.key === '[' && self.brushSize > 1) self.setBrushSize(self.brushSize - 5);
            if (e.key === ']' && self.brushSize < 100) self.setBrushSize(self.brushSize + 5);
        });
    };

    // --- Layer Management ---

    self.addLayer = function(nameOverride) {
        var name = nameOverride || 'Layer ' + (self.layers.length + 1);
        var newLayer = new Layer(self.width, self.height, name);
        self.layers.splice(self.activeLayerIndex + 1, 0, newLayer); // Add above current
        self.activeLayerIndex++;
        self.saveState();
        self.updateLayerUI();
        self.render();
    };

    self.deleteLayer = function() {
        if (self.layers.length <= 1) return;
        self.layers.splice(self.activeLayerIndex, 1);
        self.activeLayerIndex = Math.max(0, self.activeLayerIndex - 1);
        self.saveState();
        self.updateLayerUI();
        self.render();
    };

    self.setActiveLayer = function(index) {
        self.activeLayerIndex = index;
        self.updateLayerUI();
    };

    self.toggleVisibility = function(index) {
        self.layers[index].visible = !self.layers[index].visible;
        self.updateLayerUI();
        self.render();
    };

    self.mergeDown = function() {
        if (self.activeLayerIndex === 0) return;
        
        var top = self.layers[self.activeLayerIndex];
        var bottom = self.layers[self.activeLayerIndex - 1];
        
        self.saveState();

        // Draw top onto bottom
        bottom.ctx.globalAlpha = top.opacity;
        bottom.ctx.globalCompositeOperation = top.mode;
        bottom.ctx.drawImage(top.canvas, 0, 0);
        
        // Reset context of bottom
        bottom.ctx.globalAlpha = 1.0;
        bottom.ctx.globalCompositeOperation = 'source-over';

        // Remove top layer
        self.deleteLayer(false); // don't save state again
        self.activeLayerIndex = self.activeLayerIndex - 1; // Correct index after deletion
        self.updateLayerUI();
        self.render();
    };

    // --- Image Upload ---

    self.handleImageUpload = function(event) {
        var file = event.target.files[0];
        if (!file) return;

        var reader = new FileReader();
        reader.onload = function(e) {
            var img = new Image();
            img.onload = function() {
                self.addLayer("Imported Image");
                var newLayer = self.layers[self.activeLayerIndex];
                
                // Draw the image scaled to fit/fill the canvas
                var scale = Math.min(self.width / img.width, self.height / img.height);
                var x = (self.width / 2) - (img.width / 2) * scale;
                var y = (self.height / 2) - (img.height / 2) * scale;
                var w = img.width * scale;
                var h = img.height * scale;
                
                newLayer.ctx.drawImage(img, x, y, w, h);

                self.render();
                event.target.value = ''; // Clear file input
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };


    // --- Rendering ---

    self.render = function() {
        // Clear Display
        self.displayCtx.clearRect(0, 0, self.width, self.height);

        // Loop through layers bottom to top
        self.layers.forEach(function(layer) {
            if (!layer.visible) return;
            self.displayCtx.globalAlpha = layer.opacity;
            self.displayCtx.globalCompositeOperation = layer.mode;
            self.displayCtx.drawImage(layer.canvas, 0, 0);
        });
    };

    self.updateLayerUI = function() {
        var container = document.getElementById('layer-container');
        container.innerHTML = '';
        
        // Loop backwards so top layer is at top of list
        for (var i = self.layers.length - 1; i >= 0; i--) {
            var layer = self.layers[i];
            var div = document.createElement('div');
            div.className = 'layer-item ' + (i === self.activeLayerIndex ? 'active' : '');
            div.onclick = (function(index) { return function() { self.setActiveLayer(index); }; })(i);
            
            var vis = document.createElement('div');
            vis.className = 'layer-vis ' + (layer.visible ? 'visible' : '');
            vis.innerHTML = '<img src="js/icons/visible.png" alt="Visible" style="width:14px; height:14px;">';
            vis.onclick = (function(e, index) { 
                return function(event) { event.stopPropagation(); self.toggleVisibility(index); }; 
            })(i);

            var name = document.createElement('div');
            name.className = 'layer-name';
            name.textContent = layer.name;

            div.appendChild(vis);
            div.appendChild(name);
            container.appendChild(div);
        }
    };

    // --- Drawing Logic ---

    self.getMousePos = function(evt) {
        var rect = self.displayCanvas.getBoundingClientRect();
        return {
            x: evt.clientX - rect.left,
            y: evt.clientY - rect.top
        };
    };

    self.startDraw = function(e) {
        self.saveState(); // Save before drawing
        self.isDrawing = true;
        var pos = self.getMousePos(e);
        self.lastX = pos.x;
        self.lastY = pos.y;
        self.draw(e);
    };

    self.draw = function(e) {
        if (!self.isDrawing) return;
        var pos = self.getMousePos(e);
        var activeLayer = self.layers[self.activeLayerIndex];
        if (!activeLayer) return; // safety check
        var ctx = activeLayer.ctx;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = self.brushSize;
        
        if (self.currentTool === 'brush') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = self.brushColor;
            ctx.globalAlpha = self.brushOpacity;
        } else if (self.currentTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out'; // Eraser magic
            ctx.globalAlpha = 1.0;
        }

        ctx.beginPath();
        ctx.moveTo(self.lastX, self.lastY);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();

        self.lastX = pos.x;
        self.lastY = pos.y;
        
        self.render(); // Update display
    };

    self.stopDraw = function() {
        self.isDrawing = false;
    };

    // --- Tools & Filters ---

    self.setTool = function(tool) {
        self.currentTool = tool;
        document.querySelectorAll('.tool').forEach(function(el) { el.classList.remove('active'); });
        document.getElementById('tool-' + tool).classList.add('active');
    };

    self.setColor = function(color) { self.brushColor = color; };
    self.setBrushSize = function(size) { 
        self.brushSize = parseInt(size); 
        document.getElementById('val-size').textContent = size + 'px';
    };
    self.setOpacity = function(val) {
        self.brushOpacity = val / 100;
        document.getElementById('val-opacity').textContent = val + '%';
    };
    self.setBlendMode = function(mode) {
        self.layers[self.activeLayerIndex].mode = mode;
        self.render();
    };

    self.clearLayer = function() {
        self.saveState();
        var ctx = self.layers[self.activeLayerIndex].ctx;
        ctx.clearRect(0, 0, self.width, self.height);
        self.render();
    };

    self.applyFilter = function(type) {
        self.saveState();
        var layer = self.layers[self.activeLayerIndex];
        var ctx = layer.ctx;
        
        // Get image data
        var imageData = ctx.getImageData(0, 0, self.width, self.height);
        var data = imageData.data;

        // Simple Pixel Manipulation
        for (var i = 0; i < data.length; i += 4) {
            // r, g, b, a
            if (type === 'invert') {
                data[i] = 255 - data[i];     // r
                data[i+1] = 255 - data[i+1]; // g
                data[i+2] = 255 - data[i+2]; // b
            } else if (type === 'grayscale') {
                var avg = (data[i] + data[i+1] + data[i+2]) / 3;
                data[i] = avg;
                data[i+1] = avg;
                data[i+2] = avg;
            }
        }

        ctx.putImageData(imageData, 0, 0);

        if (type === 'blur') {
            // Canvas filter API for blur 
            var tempCanvas = document.createElement('canvas');
            tempCanvas.width = self.width;
            tempCanvas.height = self.height;
            var tCtx = tempCanvas.getContext('2d');
            tCtx.filter = 'blur(5px)';
            tCtx.drawImage(layer.canvas, 0, 0);
            ctx.clearRect(0,0, self.width, self.height);
            ctx.drawImage(tempCanvas, 0, 0);
        }

        self.render();
    };

    // --- History System (Undo) ---

    self.saveState = function() {
        // Limit history size to prevent memory crash
        if (self.history.length >= self.maxHistory) {
            self.history.shift();
        }
        
        // Deep copy the current layers state
        var state = self.layers.map(function(layer) {
            return {
                name: layer.name,
                visible: layer.visible,
                mode: layer.mode,
                opacity: layer.opacity,
                data: layer.canvas.toDataURL()
            };
        });
        
        self.history.push({
            layers: state,
            activeLayerIndex: self.activeLayerIndex
        });
    };

    self.undo = function() {
        if (self.history.length === 0) return;
        var lastState = self.history.pop();
        
        // Restore logic
        self.layers = [];
        self.activeLayerIndex = lastState.activeLayerIndex;
        
        lastState.layers.forEach(function(lData) {
            var newLayer = new Layer(self.width, self.height, lData.name);
            newLayer.visible = lData.visible;
            newLayer.mode = lData.mode;
            newLayer.opacity = lData.opacity;
            
            var img = new Image();
            img.src = lData.data;
            img.onload = function() {
                newLayer.ctx.drawImage(img, 0, 0);
                self.render(); // Re-render after image loads
            };
            self.layers.push(newLayer);
        });
        
        self.updateLayerUI();
        self.render();
    };

    self.download = function() {
        var link = document.createElement('a');
        link.download = 'photolite-export.png';
        link.href = self.displayCanvas.toDataURL();
        link.click();
    };

    // Initialization call
    self.init();
};

// Initialize App
var app = new PhotoLite();
