/** Sets a value at a dotted path, creating objects (or arrays, for numeric steps) on the way: setPath(o, 'object_infos.0.name', id). */
export function setPath(target, path, value) {
  const keys = String(path).split('.');
  let node = target;
  keys.forEach((key, i) => {
    if (i === keys.length - 1) { node[key] = value; return; }
    if (node[key] === undefined || node[key] === null || typeof node[key] !== 'object') node[key] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    node = node[key];
  });
  return target;
}
