/**
 * Created by HauskaNimi on 29.10.2015.
 */

//TODO: use a socket to update users about the status of their job. Store assetId in a cookie and subscribe
//users to their asset update events while the cookie exists.
/*io.socket.on('asset', function onServerSentEvent (msg) {
 console.log(msg);
 });
 io.socket.get("/asset", function(resData, jwres) {console.log(resData);})*/
var assetsInProgress = [];
function drawProgress(collection){
  var infoArea = document.getElementById("info");
  var list = document.getElementById('progressList') || document.createElement('ul');
  list.setAttribute('id', 'progressList');
  list.className = 'menu vertical';
  for(var i in collection){
    if(collection[i].error){
      collection[i].el.innerHTML = '<span>'+collection[i].error+'</span>'
    }
    if(!collection[i].error && collection[i].task){
      if(collection[i].task.Progress < 100){
        var progress = Math.floor(collection[i].task.Progress);
        collection[i].el.innerHTML =
          '<h6>'+collection[i].title+':</h6>'+
          '<div class="progress" role="progressbar" tabindex="0" aria-valuenow=' + progress + ' ' +
          'aria-valuemin="0" aria-valuetext="' + progress + '% complete"  aria-valuemax="100">' +
            '<span class="progress-meter" style="width: ' + progress + '%">' +
              '<p class="progress-meter-text">'+progress+' % complete </p>' +
            '</span>' +
          '</div>';
      } else if(collection[i].message ){
        collection[i].el.innerHTML = collection[i].title+" is "+"has been processed and is ready.<br>";
      }
    }
    if(collection[i].el.parentElement != list)
      list.appendChild(collection[i].el);
  }
  if(list.parentElement != infoArea)
    infoArea.appendChild(list);
}

io.socket.on('message', function onServerSentEvent (data) {
  if(data.media){
    function createElWithId(){
      var el = document.createElement('li');
      el.setAttribute('id', data.media.id+'progress')
      return el;
    }
    var relevantTask = _.find(assetsInProgress, function(t){return t.id == data.media.id})
    if(!relevantTask){
      var task = {
        id: data.media.id,
        title: data.media.title,
        task: data.task || null,
        message: data.message,
        error: data.error,
        el: document.getElementById(data.media.id+'progress') || createElWithId()
      };
      assetsInProgress.push(task);
    } else {
      if(data.task)
        relevantTask.task = data.task;
      else
        console.log('No tasks reported!');
    }
    drawProgress(assetsInProgress);
    console.log(data.message || data.error);
  }
});
