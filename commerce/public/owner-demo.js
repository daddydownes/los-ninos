// A standalone design demo: no API, cookies, storage or real customer records.
'use strict';
const $ = id => document.getElementById(id);
const money = cents => new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(cents/100);
const labels = {awaiting_payment:'Awaiting payment',paid:'Ready to pack',shipped:'Shipped'};
const create = (tag,className,value) => {const node=document.createElement(tag);if(className)node.className=className;if(value!==undefined)node.textContent=value;return node;};
const action = (label,handler,className='primary') => {const node=create('button',className,label);node.type='button';node.addEventListener('click',handler);return node;};
let orders,selected=null,filter='todo',pending=null;
function reset(){
  orders=[
    {id:'LN-DEMO-001',name:'Alex Example',quantity:4,total:14500,shipping:2500,status:'awaiting_payment',emails:['Payment instructions']},
    {id:'LN-DEMO-002',name:'Sam Sample',quantity:1,total:5000,shipping:2000,status:'paid',emails:['Payment instructions','Payment confirmation']},
    {id:'LN-DEMO-003',name:'Taylor Demo',quantity:3,total:11000,shipping:2000,status:'shipped',emails:['Payment instructions','Payment confirmation','Dispatch confirmation']}
  ];
  selected=null;filter='todo';pending=null;
  $('confirm-dialog').close();feedback('');show('list');renderList();
}
function feedback(message){$('feedback').textContent=message;$('feedback').hidden=!message;}
function show(view){
  for(const name of ['list','detail']) $(name+'-view').hidden=name!==view;
  $('main').focus({preventScroll:true});
  window.scrollTo({top:0,behavior:'auto'});
}
function renderList(){
  const todo=orders.filter(order=>order.status!=='shipped');
  $('work-count').textContent=todo.length ? todo.length+(todo.length===1?' order needs a next step.':' orders need a next step.') : 'Everything is up to date.';
  $('todo-count').textContent=todo.length;$('all-count').textContent=orders.length;
  $('todo').setAttribute('aria-pressed',String(filter==='todo'));$('all').setAttribute('aria-pressed',String(filter==='all'));
  const list=$('orders');list.replaceChildren();
  const shown=filter==='todo'?todo:orders;
  for(const order of shown){
    const row=action('',()=>openOrder(order.id),'order-row');
    row.setAttribute('aria-label',order.name+', '+money(order.total)+', '+labels[order.status]);
    const person=create('span','row-person');person.append(create('strong','',order.name),create('small','',order.quantity+' '+(order.quantity===1?'hat':'hats')+' · '+order.id));
    const arrow=create('span','row-arrow','→');arrow.setAttribute('aria-hidden','true');
    row.append(person,create('span','status '+order.status,labels[order.status]),create('span','row-money',money(order.total)),arrow);list.append(row);
  }
  if(!shown.length){const empty=create('div','empty');empty.append(create('strong','','All caught up.'),create('span','','You can find completed orders under All orders.'));list.append(empty);}
}
function back(){feedback('');renderList();show('list');}
function disclosure(title,content){
  const box=create('details','card');box.append(create('summary','',title),content);return box;
}
function openOrder(id){selected=id;feedback('');renderDetail();show('detail');}
function renderDetail(){
  const order=orders.find(order=>order.id===selected);if(!order)return;
  const panel=$('detail-view');panel.replaceChildren(action('← Orders',back,'back'));
  const heading=create('div','detail-heading'), title=create('div');
  const h1=create('h1','',order.name);h1.id='order-title';title.append(h1,create('p','',order.id+' · Sample order'));
  heading.append(title,create('span','status '+order.status,labels[order.status]));panel.append(heading);
  const card=create('div','card'),product=create('div','product'),img=create('img');
  img.src='/assets/hat-front-logo-v1.webp';img.alt='Los Niños navy snapback';img.width=82;img.height=82;
  const description=create('div');description.append(create('h2','','Los Niños snapback'),create('p','',order.quantity+' × $30.00'));product.append(img,description);card.append(product);
  const prices=create('dl','price-lines');
  for(const [label,value,cl] of [['Hats',order.total-order.shipping,''],['Shipping',order.shipping,''],['Total',order.total,'total']]){const row=create('div',cl);row.append(create('dt','',label),create('dd','',money(value)));prices.append(row);}card.append(prices);
  const next=create('div','next-step');
  const titleText=order.status==='awaiting_payment'?'Check the payment':order.status==='paid'?'Ready to send':'All done.';
  const copy=order.status==='awaiting_payment'?'In the real dashboard, check the bank for '+money(order.total)+' and reference '+order.id+'.':order.status==='paid'?'Pack the hat, then confirm once the parcel has been handed over.':'This sample order has been dispatched.';
  next.append(create('h2','',titleText),create('p','',copy));
  if(order.status!=='shipped')next.append(action(order.status==='awaiting_payment'?'Confirm payment':'Mark as shipped',()=>confirmAction(order.status==='awaiting_payment'?'paid':'shipped')));
  card.append(next);panel.append(card);
  const customer=create('div','disclosure-content');
  customer.append(create('p','',order.name+'\n1 Example Street\nSydney NSW 2000'),create('p','','sample@example.test · 0400 000 000'));
  customer.firstChild.className='address';
  panel.append(disclosure('Delivery details',customer));
  const emails=create('div','disclosure-content');
  for(const kind of order.emails){const row=create('div','email-row');row.append(create('span','',kind),create('small','','Simulated'));emails.append(row);}
  emails.append(create('p','hint','This demo never sends emails.'));
  panel.append(disclosure('Emails',emails));
}
function confirmAction(status){
  pending=status;$('confirm-check').checked=false;
  $('confirm-title').textContent=status==='paid'?'Confirm this sample payment?':'Mark this sample order shipped?';
  $('confirm-copy').textContent='This only updates the demo. No payment, email or shipment is created.';
  $('confirm-label').textContent=status==='paid'?'Simulate the full payment arriving.':'Simulate handing over the parcel.';
  $('confirm-submit').textContent=status==='paid'?'Confirm demo payment':'Confirm demo dispatch';
  $('confirm-dialog').showModal();
}
$('confirm-form').addEventListener('submit',event=>{
  event.preventDefault();if(!$('confirm-form').reportValidity()||!pending)return;
  const order=orders.find(order=>order.id===selected);
  order.status=pending;order.emails.push(pending==='paid'?'Payment confirmation':'Dispatch confirmation');
  const message=pending==='paid'?'Demo payment confirmed. This order is ready to pack.':'Demo order marked as shipped.';
  pending=null;$('confirm-dialog').close();renderDetail();feedback(message);$('main').focus({preventScroll:true});
});
$('cancel-action').addEventListener('click',()=>{$('confirm-dialog').close();pending=null;});
$('confirm-dialog').addEventListener('cancel',()=>{pending=null;});
$('reset').addEventListener('click',()=>{reset();feedback('Demo reset. You can start again.');});
$('todo').addEventListener('click',()=>{filter='todo';feedback('');renderList();});
$('all').addEventListener('click',()=>{filter='all';feedback('');renderList();});
reset();
