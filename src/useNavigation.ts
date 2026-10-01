import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {App as NativeApp} from '@capacitor/app';
import {Capacitor} from '@capacitor/core';

type Entry = {screen: string; scroll: number[]};
export function useNavigation(initial: string) {
  const [screen, setScreen] = useState(initial);
  const entries = useRef<Entry[]>([{screen: initial, scroll: []}]);
  const index = useRef(0);
  const resetTarget = useRef<string|null>(null);
  const restoring = useRef(false);
  const scrollElements = () => Array.from(document.querySelectorAll<HTMLElement>('.page, .scroll-body')).filter(el => el.offsetParent !== null);
  const capture = () => {
    entries.current[index.current].scroll = scrollElements().map(el => el.scrollTop);
  };
  useEffect(() => {
    history.replaceState({...history.state, yoeoIndex: 0}, '');
    const pop = (event: PopStateEvent) => {
      if (restoring.current) {restoring.current = false; return;}
      if (resetTarget.current) {
        const target = resetTarget.current;
        resetTarget.current = null;
        index.current = 0;
        entries.current = [{screen: target, scroll: []}];
        history.replaceState({...history.state, yoeoIndex: 0}, '');
        setScreen(target);
        return;
      }
      const next = event.state?.yoeoIndex;
      if (typeof next !== 'number' || !entries.current[next]) return;
      if (next < index.current && !document.dispatchEvent(new Event('yoeo:back', {cancelable: true}))) {
        restoring.current = true;
        history.go(index.current - next);
        return;
      }
      capture();
      index.current = next;
      setScreen(entries.current[next].screen);
    };
    window.addEventListener('popstate', pop);
    const listener = Capacitor.isNativePlatform() ? NativeApp.addListener('backButton', () => {
      if (index.current > 0) history.back();
    }) : null;
    return () => {window.removeEventListener('popstate', pop); void listener?.then(handle => handle.remove());};
  }, []);
  useLayoutEffect(() => {
    scrollElements().forEach((el, i) => {el.scrollTop = entries.current[index.current].scroll[i] || 0;});
  }, [screen]);
  function navigate(next: string, replace = false) {
    if (next === screen) return;
    capture();
    if (!replace) index.current++;
    entries.current = entries.current.slice(0, index.current + 1);
    entries.current[index.current] = {screen: next, scroll: []};
    history[replace ? 'replaceState' : 'pushState']({...history.state, yoeoIndex: index.current}, '');
    setScreen(next);
  }
  function back() {
    if (index.current > 0) history.back();
    else navigate('home', true);
  }
  function reset(next: string) {
    if (index.current > 0) {resetTarget.current = next; history.go(-index.current);}
    else navigate(next, true);
  }
  return {screen, navigate, back, reset};
}
