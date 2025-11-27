/**
  Layer object represents a single image layer.
  It has its own off-screen canvas to hold pixel data.
 */
var Layer = function(width, height, name) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.name = name;
    this.visible = true;
    this.mode = 'source-over'; // Blend mode
    this.opacity = 1.0;
};
