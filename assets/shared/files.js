function download(data,filename){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
 async function readFile(file){if(!file||file.size>20*1024*1024)throw Error('請選擇 20 MB 內的 JSON 備份。');return JSON.parse(await file.text())}

export const FitnessFiles={download,readFile};
