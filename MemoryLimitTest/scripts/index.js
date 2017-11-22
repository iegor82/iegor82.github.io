$(function() {
    for (let i = 0; i < 800; ++i) {
        var canvas = document.createElement("canvas");
        canvas.width = 1000;
        canvas.height = 1000;
        let context = canvas.getContext("2d");
        context.fillStyle = 'rgba(' + ((Math.random()*255)|0) + ',' + ((Math.random()*255)|0) + ',' + ((Math.random()*255)|0) + ',1)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        $('.content').append(canvas);
    }
})