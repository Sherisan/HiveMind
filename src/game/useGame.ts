import { useCallback, useEffect, useRef, useState } from 'react';
import type { HiveApi, Snapshot } from './engine.ts';
import type { BeeLevel } from './math.ts';
import { sound } from './sound.ts';

export type Phase = 'loading' | 'idle' | 'live' | 'ended';
/** What a pick turned out to be. `void`: it never counted (round already over, or the request failed). */
export type PickOutcome = 'honey' | 'bee' | 'void';

/** Minimum time a cell cracks open before it shows honey or a bee. */
const PICK_SUSPENSE_MS = 320;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useGame(api: HiveApi) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [pending, setPending] = useState(0);
  const [closing, setClosing] = useState(false);
  /** The cell being opened right now. */
  const [opening, setOpening] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  /** Between rounds with nothing left to show: no round yet, or the last result was dismissed. */
  const [resting, setResting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const snapRef = useRef<Snapshot | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pendingRef = useRef(0);
  const resultTimer = useRef<number>();

  const commit = useCallback((next: Snapshot) => {
    snapRef.current = next;
    setSnap(next);
    if (next.round?.status === 'live') setResting(false);
  }, []);

  useEffect(() => {
    api.init().then(commit, (e: Error) => setError(e.message));
  }, [api, commit]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3200);
    return () => clearTimeout(t);
  }, [error]);

  /** Every server call goes through one queue, so a cash-out can never overtake a pick. */
  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    pendingRef.current += 1;
    setPending(pendingRef.current);
    const p = queue.current.then(task).finally(() => {
      pendingRef.current -= 1;
      setPending(pendingRef.current);
    });
    queue.current = p.catch(() => undefined);
    return p;
  }, []);

  /** Sounds and the result card for a round that just ended. The sting itself is staged by the hive. */
  const finish = useCallback((next: Snapshot) => {
    const status = next.round?.status;
    if (!status || status === 'live') return;
    if (status === 'cashed') sound.cash();
    else if (status === 'cleared' || status === 'maxed') sound.jackpot();
    clearTimeout(resultTimer.current);
    // A sting waits for the swarm to come out of the screen (the head-on bee lands at about 1.2 s).
    const delay = status === 'stung' ? 2300 : status === 'cashed' ? 450 : 1100;
    resultTimer.current = window.setTimeout(() => setShowResult(true), delay);
  }, []);

  /**
   * After a failed call, re-read the server's state: the round may have moved on without us (the server cashes out a
   * round left idle for 10 minutes). Called from inside the queue, so it can't race another call.
   */
  const resync = useCallback(async () => {
    try {
      const was = snapRef.current?.round;
      const next = await api.init();
      commit(next);
      if (was?.status === 'live' && next.round?.id === was.id) finish(next);
    } catch {
      /* still unreachable: keep what we have */
    }
  }, [api, commit, finish]);

  const bet = useCallback(
    (amount: number, bees: BeeLevel) =>
      enqueue(async () => {
        try {
          const next = await api.bet(amount, bees);
          clearTimeout(resultTimer.current);
          setShowResult(false);
          commit(next);
          sound.start();
        } catch (e) {
          setError((e as Error).message);
          await resync();
        }
      }),
    [api, enqueue, commit, resync],
  );

  const pick = useCallback(
    (cell: number): Promise<PickOutcome> => {
      if (snapRef.current?.round?.status !== 'live' || pendingRef.current > 0) return Promise.resolve('void');
      setOpening(cell);
      sound.crack();
      return enqueue(async (): Promise<PickOutcome> => {
        try {
          const [next] = await Promise.all([api.pick(cell), wait(PICK_SUSPENSE_MS)]);
          commit(next);
          finish(next);
          const picks = next.round?.picks ?? [];
          const last = picks[picks.length - 1];
          return last?.cell === cell && last.bee ? 'bee' : 'honey';
        } catch (e) {
          setError((e as Error).message);
          await resync();
          return 'void';
        } finally {
          setOpening(null);
        }
      });
    },
    [api, enqueue, commit, finish, resync],
  );

  const cashOut = useCallback(() => {
    setClosing(true);
    return enqueue(async () => {
      try {
        if (snapRef.current?.round?.status !== 'live') return;
        const next = await api.cashOut();
        commit(next);
        finish(next);
      } catch (e) {
        setError((e as Error).message);
        await resync();
      } finally {
        setClosing(false);
      }
    });
  }, [api, enqueue, commit, finish, resync]);

  const setClientSeed = useCallback(
    (seed: string) =>
      enqueue(async () => {
        try {
          commit(await api.setClientSeed(seed));
        } catch (e) {
          setError((e as Error).message);
        }
      }),
    [api, enqueue, commit],
  );

  const refill = useCallback(
    () =>
      enqueue(async () => {
        try {
          if (api.refill) commit(await api.refill());
        } catch (e) {
          setError((e as Error).message);
        }
      }),
    [api, enqueue, commit],
  );

  const dismissResult = useCallback(() => {
    setShowResult(false);
    setResting(true);
  }, []);

  const round = snap?.round ?? null;
  const phase: Phase = !snap ? 'loading' : !round ? 'idle' : round.status === 'live' ? 'live' : 'ended';

  return {
    snap,
    round,
    phase,
    /** Calls queued or in flight. */
    pending,
    /** A cash-out has been requested: stop accepting picks. */
    closing,
    opening,
    showResult,
    resting,
    error,
    actions: { bet, pick, cashOut, setClientSeed, refill, dismissResult },
  };
}

export type Game = ReturnType<typeof useGame>;
