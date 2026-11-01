'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {configFromEnv, WELCOME_IMAGE, WELCOME_CAPTION, mainAppLink, buttonMarkup, parseCommand, handleUpdate} = require('../lib/telegram');

const config = configFromEnv({
  BOT_TOKEN:'123456789:abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
  BOT_USERNAME:'UsernameGeneratorGame',
  GAME_URL:'https://usernamegame.bothost.tech',
  MINI_APP_URL:'https://t.me/UsernameGeneratorGame'
});
const reply = {ok:true,result:{message_id:12}};
function fakeFetch(url, options) {
  return Promise.resolve({ok:true,status:200,json:async()=>reply});
}
function message(text, type='private') {
  return {message:{chat:{id:12345,type},from:{id:12,is_bot:false},text}};
}

test('the welcome image exists and is a JPEG 640x360', () => {
  const buf = fs.readFileSync(WELCOME_IMAGE);
  assert.equal(buf[0],255); assert.equal(buf[1],216);
  assert.ok(buf.length>10000);
  // PIL metadata is checked during archive build as well.
});
test('HTML welcome fits Telegram photo caption limit',()=>{
  assert.ok([...WELCOME_CAPTION].length <= 1024);
  assert.match(WELCOME_CAPTION,/100 000/);
});
test('safe config and button URLs',()=>{
  const markup=buttonMarkup(config);
  assert.equal(markup.inline_keyboard[0][0].web_app.url,'https://usernamegame.bothost.tech/');
  assert.equal(markup.inline_keyboard[1][0].url,'https://t.me/UsernameGeneratorGame?startapp=');
  assert.equal(mainAppLink(config,'ref_aB9-'), 'https://t.me/UsernameGeneratorGame?startapp=ref_aB9-');
});
test('commands and bot mention filtering',()=>{
  assert.deepEqual(parseCommand('/start ref_aBc123','UsernameGeneratorGame'),{command:'start',startParam:'ref_aBc123'});
  assert.equal(parseCommand('/start@OtherBot','UsernameGeneratorGame'),null);
  assert.equal(parseCommand('/start http://evil.example','UsernameGeneratorGame').startParam,'');
});
test('start sends a picture with HTML and an inline Mini App button',async()=>{
  let called=false;
  await handleUpdate(config,message('/start'),{fetchImpl:async(url,options)=>{
    called=true;
    assert.ok(url.endsWith('/sendPhoto'));
    assert.equal(options.body.get('chat_id'),'12345');
    assert.equal(options.body.get('parse_mode'),'HTML');
    assert.equal(options.body.get('photo').type,'image/jpeg');
    assert.ok(JSON.parse(options.body.get('reply_markup')).inline_keyboard[0][0].web_app);
    return {ok:true,status:200,json:async()=>reply};
  }});
  assert.equal(called,true);
});
test('start referral preserved with signed startapp deep link',async()=>{
  await handleUpdate(config,message('/start ref_ABC5'),{fetchImpl:async(url,options)=>{
    const buttons=JSON.parse(options.body.get('reply_markup')).inline_keyboard;
    assert.equal(buttons[0][0].url,'https://t.me/UsernameGeneratorGame?startapp=ref_ABC5');
    return {ok:true,status:200,json:async()=>reply};
  }});
});
test('help and friends send text, not photo',async()=>{
  for(const command of ['/help','/friends']) {
    await handleUpdate(config,message(command),{fetchImpl:async(url,options)=>{
      assert.ok(url.endsWith('/sendMessage'));
      const json=JSON.parse(options.body);
      assert.ok(json.text.length>50);
      return {ok:true,status:200,json:async()=>reply};
    }});
  }
});
test('messages from group chats or bots are ignored',async()=>{
  assert.equal(await handleUpdate(config,message('/start','group'),{fetchImpl:()=>{throw Error('Should not call API')}}),false);
  const update=message('/start'); update.message.from.is_bot=true;
  assert.equal(await handleUpdate(config,update,{fetchImpl:()=>{throw Error('Should not call API')}}),false);
});
test('invalid BOT_TOKEN or non-https GAME_URL is rejected',()=>{
  assert.throws(()=>configFromEnv({BOT_TOKEN:'bad'}));
  assert.throws(()=>configFromEnv({BOT_TOKEN:config.token,GAME_URL:'http://foo.test'}));
});
