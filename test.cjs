const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');
const searchStr1 = '  return (\n    <div className="app-container">';
const searchStr2 = '  return (\r\n    <div className="app-container">';
console.log('LF:', code.indexOf(searchStr1));
console.log('CRLF:', code.indexOf(searchStr2));
