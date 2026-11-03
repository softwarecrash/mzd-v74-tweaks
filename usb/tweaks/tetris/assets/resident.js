/* Forward only the active Tetris view to its own registered service. */
(function () {
    'use strict';
    window.MzdGuiResidents.register('tetris',function (context) {
        var pending=null;
        function request(view,id,score) {
            if(typeof score==='number')pending=pending===null?score:Math.max(pending,score);
            context.service.request('score',pending===null?{}:{score:pending},function(error,result){
                if(!error && result && pending!==null && result.highscore>=pending)pending=null;
                if(!view || context.view()!==view)return;
                view.source.postMessage({type:'mzd-module-tetris-score-result',token:view.token,id:id,error:error||'',result:result},'*');
            });
        }
        context.onMessage(function (event) {
            var view=context.view(),data=event.data;
            if(!view || event.source!==view.source || !data || data.token!==view.token || data.type!=='mzd-module-tetris-score')return;
            data=data.value;if(!data || typeof data.id!=='number')return;
            request(view,data.id,data.score);
        });
        context.onServiceReady(function(){request(context.view(),0,null);});
    });
}());
