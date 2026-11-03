/* Forward only the active game view to its own registered service. */
(function () {
    'use strict';
    window.MzdGuiResidents.register('snake',function (context) {
        var pending=null;
        function request(view,id,record) {
            if(typeof record==='number')pending=pending===null?record:Math.max(pending,record);
            context.service.request('record',pending===null?{}:{value:pending},function(error,result){
                if(!error && result && pending!==null && result.best>=pending)pending=null;
                if(!view || context.view()!==view)return;
                view.source.postMessage({type:'mzd-module-snake-record-result',token:view.token,id:id,error:error||'',result:result},'*');
            });
        }
        context.onMessage(function (event) {
            var view=context.view(),data=event.data;
            if(!view || event.source!==view.source || !data || data.token!==view.token || data.type!=='mzd-module-snake-record')return;
            data=data.value;if(!data || typeof data.id!=='number')return;
            request(view,data.id,data.value);
        });
        context.onServiceReady(function(){request(context.view(),0,null);});
    });
}());
