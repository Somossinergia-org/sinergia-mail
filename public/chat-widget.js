(function(){
/* SOMOS SINERGIA — Chat Widget con Recepcionista IA */
var API='https://sinergia-mail-somossinergia-orgs-projects.vercel.app/api/chat/widget';
var msgs=[];
var open=false;
var loading=false;
var el={};

function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML;}

function render(){
  if(el.root)return;
  var css=document.createElement('style');
  css.textContent='\
#ss-chat-btn{position:fixed;bottom:24px;right:24px;z-index:99999;width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#06b6d4,#8b5cf6);border:none;cursor:pointer;box-shadow:0 4px 20px rgba(6,182,212,0.4);display:flex;align-items:center;justify-content:center;transition:all 0.3s;}\
#ss-chat-btn:hover{transform:scale(1.1);box-shadow:0 6px 30px rgba(6,182,212,0.6);}\
#ss-chat-btn svg{width:28px;height:28px;fill:#fff;}\
#ss-chat-btn .ss-badge{position:absolute;top:-2px;right:-2px;width:16px;height:16px;border-radius:50%;background:#10b981;border:2px solid #0a0a0f;animation:ss-pulse 2s infinite;}\
@keyframes ss-pulse{0%,100%{opacity:1;}50%{opacity:0.5;}}\
#ss-chat-panel{position:fixed;bottom:96px;right:24px;z-index:99998;width:380px;max-width:calc(100vw - 48px);height:520px;max-height:calc(100vh - 140px);border-radius:20px;overflow:hidden;display:none;flex-direction:column;background:#0f0f1a;border:1px solid rgba(255,255,255,0.08);box-shadow:0 20px 60px rgba(0,0,0,0.5);font-family:Inter,system-ui,sans-serif;animation:ss-slideup 0.3s ease;}\
#ss-chat-panel.open{display:flex;}\
@keyframes ss-slideup{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}\
.ss-chat-header{padding:16px 20px;background:linear-gradient(135deg,rgba(6,182,212,0.15),rgba(139,92,246,0.15));border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:12px;}\
.ss-chat-avatar{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#06b6d4,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;}\
.ss-chat-hinfo h4{margin:0;font-size:14px;font-weight:700;color:#fff;}\
.ss-chat-hinfo p{margin:2px 0 0;font-size:11px;color:#10b981;display:flex;align-items:center;gap:4px;}\
.ss-chat-hinfo p::before{content:"";width:6px;height:6px;border-radius:50%;background:#10b981;}\
.ss-chat-close{margin-left:auto;background:none;border:none;color:#94a3b8;cursor:pointer;font-size:20px;padding:4px 8px;border-radius:8px;}\
.ss-chat-close:hover{background:rgba(255,255,255,0.05);color:#fff;}\
.ss-chat-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;}\
.ss-chat-msgs::-webkit-scrollbar{width:4px;}\
.ss-chat-msgs::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:2px;}\
.ss-msg{max-width:85%;padding:12px 16px;border-radius:16px;font-size:13px;line-height:1.5;word-wrap:break-word;animation:ss-fadein 0.2s ease;}\
@keyframes ss-fadein{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}\
.ss-msg.bot{align-self:flex-start;background:rgba(255,255,255,0.05);color:#e2e8f0;border-bottom-left-radius:4px;}\
.ss-msg.user{align-self:flex-end;background:linear-gradient(135deg,#06b6d4,#8b5cf6);color:#fff;border-bottom-right-radius:4px;}\
.ss-msg.typing{color:#94a3b8;font-style:italic;}\
.ss-typing-dots span{animation:ss-dot 1.4s infinite;opacity:0.3;}\
.ss-typing-dots span:nth-child(2){animation-delay:0.2s;}\
.ss-typing-dots span:nth-child(3){animation-delay:0.4s;}\
@keyframes ss-dot{0%,100%{opacity:0.3;}50%{opacity:1;}}\
.ss-chat-input{padding:12px 16px;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:8px;background:rgba(0,0,0,0.2);}\
.ss-chat-input input{flex:1;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:10px 16px;color:#fff;font-size:13px;outline:none;font-family:inherit;}\
.ss-chat-input input::placeholder{color:#64748b;}\
.ss-chat-input input:focus{border-color:rgba(6,182,212,0.4);}\
.ss-chat-input button{width:40px;height:40px;border-radius:12px;border:none;background:linear-gradient(135deg,#06b6d4,#8b5cf6);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;flex-shrink:0;}\
.ss-chat-input button:hover{transform:scale(1.05);}\
.ss-chat-input button:disabled{opacity:0.5;cursor:not-allowed;transform:none;}\
.ss-chat-input button svg{width:18px;height:18px;fill:#fff;}\
@media(max-width:480px){#ss-chat-panel{bottom:0;right:0;width:100vw;max-width:100vw;height:100vh;max-height:100vh;border-radius:0;}#ss-chat-btn{bottom:16px;right:16px;width:54px;height:54px;}}\
';
  document.head.appendChild(css);

  /* Hide JoinChat if present */
  var jcStyle=document.createElement('style');
  jcStyle.textContent='.joinchat,.joinchat__button,.joinchat__tooltip{display:none !important;}';
  document.head.appendChild(jcStyle);

  var btn=document.createElement('button');
  btn.id='ss-chat-btn';
  btn.setAttribute('aria-label','Abrir chat con Somos Sinergia');
  btn.innerHTML='<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/><path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg><span class="ss-badge"></span>';
  btn.onclick=toggle;
  document.body.appendChild(btn);
  el.btn=btn;

  var panel=document.createElement('div');
  panel.id='ss-chat-panel';
  panel.innerHTML='<div class="ss-chat-header"><div class="ss-chat-avatar">\uD83E\uDD16</div><div class="ss-chat-hinfo"><h4>Recepcionista IA</h4><p>En l\u00EDnea \u2014 Somos Sinergia</p></div><button class="ss-chat-close" aria-label="Cerrar chat">\u00D7</button></div><div class="ss-chat-msgs"></div><div class="ss-chat-input"><input type="text" placeholder="Escribe tu mensaje..." maxlength="500"><button aria-label="Enviar"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button></div>';
  document.body.appendChild(panel);
  el.panel=panel;
  el.msgsDiv=panel.querySelector('.ss-chat-msgs');
  el.input=panel.querySelector('input');
  el.sendBtn=panel.querySelector('.ss-chat-input button');
  panel.querySelector('.ss-chat-close').onclick=toggle;
  el.sendBtn.onclick=send;
  el.input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey)send();});

  addMsg('bot','\u00A1Hola! \uD83D\uDC4B Soy la recepcionista virtual de Somos Sinergia. \u00BFEn qu\u00E9 puedo ayudarte? Puedo informarte sobre nuestros servicios de energ\u00EDa, telefon\u00EDa, seguros, IA y mucho m\u00E1s.');
}

function toggle(){
  open=!open;
  if(open){el.panel.classList.add('open');setTimeout(function(){el.input.focus();},100);}
  else{el.panel.classList.remove('open');}
}

function addMsg(type,text){
  var div=document.createElement('div');
  div.className='ss-msg '+type;
  div.innerHTML=esc(text).replace(/\n/g,'<br>');
  el.msgsDiv.appendChild(div);
  el.msgsDiv.scrollTop=el.msgsDiv.scrollHeight;
  return div;
}

function send(){
  if(loading)return;
  var text=el.input.value.trim();
  if(!text)return;
  el.input.value='';
  addMsg('user',text);
  msgs.push({role:'user',content:text});

  var typingDiv=document.createElement('div');
  typingDiv.className='ss-msg bot typing';
  typingDiv.innerHTML='<span class="ss-typing-dots"><span>\u25CF</span> <span>\u25CF</span> <span>\u25CF</span></span>';
  el.msgsDiv.appendChild(typingDiv);
  el.msgsDiv.scrollTop=el.msgsDiv.scrollHeight;

  loading=true;
  el.sendBtn.disabled=true;

  fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:msgs})})
  .then(function(r){return r.json();})
  .then(function(data){
    typingDiv.remove();
    var reply=data.response||data.error||'Disculpa, ha habido un error. Ll\u00E1manos al 966 741 545.';
    addMsg('bot',reply);
    msgs.push({role:'assistant',content:reply});
  })
  .catch(function(){
    typingDiv.remove();
    addMsg('bot','No he podido conectar. Puedes llamarnos al 966 741 545 o escribirnos a info@somossinergia.es.');
  })
  .finally(function(){
    loading=false;
    el.sendBtn.disabled=false;
    el.input.focus();
  });
}

if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',render);}
else{render();}
})();
