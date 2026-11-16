import {normalizeHex} from './services/model-appearance-service.js';
// Shared UI for the whole-plan view and individual model cards.
export function mountModelColorControls(container,{profiles,colors,onChange}){
  container.replaceChildren();const rows=[];
  for(const profile of profiles){
    const row=document.createElement('form');row.className='model-color-row';
    const title=document.createElement('label');title.textContent=profile.name+' · '+profile.region;
    const fields=document.createElement('div');fields.className='model-color-fields';
    const picker=document.createElement('input');picker.type='color';picker.setAttribute('aria-label',profile.name+'選色');
    const text=document.createElement('input');text.type='text';text.maxLength=7;text.spellcheck=false;text.autocomplete='off';text.setAttribute('aria-label',profile.name+' HEX 色碼');
    const apply=document.createElement('button');apply.type='submit';apply.textContent='套用';apply.setAttribute('aria-label','套用'+profile.name+'顏色');
    const reset=document.createElement('button');reset.type='button';reset.textContent='恢復原色';reset.setAttribute('aria-label','恢復'+profile.name+'原色');
    const status=document.createElement('span');status.className='model-color-feedback';status.setAttribute('role','status');
    const sync=palette=>{const value=palette[profile.asset_id]||profile.default_hex;picker.value=value;text.value=value;status.textContent=palette[profile.asset_id]?'自訂顏色':'原始配色';text.removeAttribute('aria-invalid');};
    const commit=hex=>{try{const value=hex===null?null:normalizeHex(hex),outcome=onChange(profile.asset_id,value);picker.value=value||profile.default_hex;text.value=value||profile.default_hex;text.removeAttribute('aria-invalid');status.textContent=outcome?.warning||(value?'已套用':'已恢復原色');}catch(error){status.textContent=error.message;text.setAttribute('aria-invalid','true');}};
    row.addEventListener('submit',event=>{event.preventDefault();commit(text.value);});picker.addEventListener('change',()=>commit(picker.value));reset.addEventListener('click',()=>commit(null));
    fields.append(picker,text,apply,reset);row.append(title,fields,status);container.append(row);rows.push(sync);sync(colors);
  }
  return {refresh:palette=>rows.forEach(sync=>sync(palette))};
}
