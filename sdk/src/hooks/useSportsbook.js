import { useState, useEffect, useCallback, useRef } from 'react';
import { getEnv } from '../utils';

const getApiUrl = () => getEnv('VITE_NEOSTRIKE_API_URL') || '';

// ── useSportsCatalogue ────────────────────────────────────────────────────────
export const useSportsCatalogue = () => {
    const [sports, setSports] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetch_ = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${getApiUrl()}/api/v1/sports`);
            const data = await res.json();
            setSports(data.sports || []);
        } catch (e) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetch_(); }, [fetch_]);

    return { sports, isLoading, error, refresh: fetch_ };
};

// ── useLeagues ────────────────────────────────────────────────────────────────
export const useLeagues = (sportSlug) => {
    const [leagues, setLeagues] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetch_ = useCallback(async () => {
        if (!sportSlug) return;
        setIsLoading(true);
        try {
            const res = await fetch(`${getApiUrl()}/api/v1/sports/${sportSlug}/leagues`);
            const data = await res.json();
            setLeagues(data.leagues || []);
        } catch (e) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    }, [sportSlug]);

    useEffect(() => { fetch_(); }, [fetch_]);

    return { leagues, isLoading, error, refresh: fetch_ };
};

// ── useEvents ─────────────────────────────────────────────────────────────────
export const useEvents = ({ league, status, from, to } = {}) => {
    const [events, setEvents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [nextCursor, setNextCursor] = useState(null);

    const fetch_ = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (league) params.set('league', league);
            if (status) params.set('status', status);
            if (from) params.set('from', from);
            if (to) params.set('to', to);
            const res = await fetch(`${getApiUrl()}/api/v1/events?${params}`);
            const data = await res.json();
            setEvents(data.events || []);
            setNextCursor(data.nextCursor || null);
        } catch (e) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    }, [league, status, from, to]);

    useEffect(() => { fetch_(); }, [fetch_]);

    return { events, isLoading, error, nextCursor, refresh: fetch_ };
};

// ── useEvent ──────────────────────────────────────────────────────────────────
export const useEvent = (eventId) => {
    const [event, setEvent] = useState(null);
    const [odds, setOdds] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const esRef = useRef(null);

    const fetch_ = useCallback(async () => {
        if (!eventId) return;
        setIsLoading(true);
        try {
            const res = await fetch(`${getApiUrl()}/api/v1/events/${eventId}`);
            const data = await res.json();
            setEvent(data.event || null);
            // Build odds map from markets/selections
            const oddsMap = {};
            (data.event?.markets || []).forEach(m => {
                (m.selections || []).forEach(s => {
                    oddsMap[s.id] = s.current_odds;
                });
            });
            setOdds(oddsMap);
        } catch (e) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    }, [eventId]);

    useEffect(() => { fetch_(); }, [fetch_]);

    const subscribe = useCallback(() => {
        if (!eventId || esRef.current) return;
        try {
            const es = new EventSource(`${getApiUrl()}/api/v1/events/${eventId}/stream`);
            esRef.current = es;
            es.onmessage = (e) => {
                try {
                    const payload = JSON.parse(e.data);
                    if (payload.type === 'odds_change') {
                        setOdds(prev => ({ ...prev, [payload.selection_id]: payload.odds }));
                        // Also update the event's selection
                        setEvent(prev => {
                            if (!prev) return prev;
                            return {
                                ...prev,
                                markets: prev.markets.map(m => ({
                                    ...m,
                                    selections: m.selections.map(s =>
                                        s.id === payload.selection_id
                                            ? { ...s, previous_odds: s.current_odds, current_odds: payload.odds }
                                            : s
                                    )
                                }))
                            };
                        });
                    }
                } catch (_) {}
            };
        } catch (_) {}
    }, [eventId]);

    const unsubscribe = useCallback(() => {
        if (esRef.current) {
            esRef.current.close();
            esRef.current = null;
        }
    }, []);

    useEffect(() => {
        return () => unsubscribe();
    }, [unsubscribe]);

    return { event, odds, isLoading, error, subscribe, unsubscribe };
};

// ── Bet Slip State Machine ─────────────────────────────────────────────────────
const SLIP_KEY = 'ns_bet_slip';
const STATES = { EMPTY: 'EMPTY', EDITING: 'EDITING', VALIDATING: 'VALIDATING', PLACING: 'PLACING', PLACED: 'PLACED', FAILED: 'FAILED' };

const loadSlip = () => {
    try { return JSON.parse(sessionStorage.getItem(SLIP_KEY) || 'null'); } catch (_) { return null; }
};
const saveSlip = (slip) => {
    try { sessionStorage.setItem(SLIP_KEY, JSON.stringify(slip)); } catch (_) {}
};

export const useBetSlip = (config = {}) => {
    const [state, setState] = useState(STATES.EMPTY);
    const [legs, setLegs] = useState(() => loadSlip()?.legs || []);
    const [stake, setStake] = useState(() => loadSlip()?.stake || '');
    const [betType, setBetType] = useState('SINGLE');
    const [placedBet, setPlacedBet] = useState(null);
    const [error, setError] = useState(null);
    const [changedOdds, setChangedOdds] = useState([]);

    // Persist to sessionStorage
    useEffect(() => {
        saveSlip({ legs, stake });
    }, [legs, stake]);

    // Derive state from legs
    useEffect(() => {
        if (state === STATES.PLACING || state === STATES.PLACED || state === STATES.FAILED) return;
        if (legs.length === 0) { setState(STATES.EMPTY); return; }
        setState(STATES.EDITING);
    }, [legs.length]);

    // Clear on logout
    useEffect(() => {
        const handler = () => {
            setLegs([]);
            setStake('');
            setState(STATES.EMPTY);
            setPlacedBet(null);
            setError(null);
            sessionStorage.removeItem(SLIP_KEY);
        };
        window.addEventListener('neostrike:logout', handler);
        return () => window.removeEventListener('neostrike:logout', handler);
    }, []);

    const add = useCallback((selection) => {
        if (!selection?.id) return;
        if (selection.status === 'suspended') {
            setError('This selection is suspended');
            return;
        }
        setLegs(prev => {
            if (prev.find(l => l.selection_id === selection.id)) return prev;
            return [...prev, {
                selection_id: selection.id,
                selection_name: selection.name,
                market_type: selection.market_type,
                event_name: selection.event_name,
                odds: selection.current_odds,
                status: selection.status || 'open'
            }];
        });
        setError(null);
    }, []);

    const remove = useCallback((selectionId) => {
        setLegs(prev => prev.filter(l => l.selection_id !== selectionId));
    }, []);

    const clear = useCallback(() => {
        setLegs([]);
        setStake('');
        setState(STATES.EMPTY);
        setPlacedBet(null);
        setError(null);
        setChangedOdds([]);
    }, []);

    const updateOdds = useCallback((selectionId, newOdds) => {
        setLegs(prev => prev.map(l =>
            l.selection_id === selectionId ? { ...l, odds: newOdds, oddsChanged: true } : l
        ));
        setChangedOdds(prev => [...new Set([...prev, selectionId])]);
    }, []);

    const acceptOddsChange = useCallback((selectionId) => {
        setLegs(prev => prev.map(l =>
            l.selection_id === selectionId ? { ...l, oddsChanged: false } : l
        ));
        setChangedOdds(prev => prev.filter(id => id !== selectionId));
    }, []);

    const validationErrors = [];
    if (legs.length === 0) validationErrors.push('Add at least one selection');
    if (!stake || parseFloat(stake) <= 0) validationErrors.push('Enter a valid stake');
    if (changedOdds.length > 0) validationErrors.push('Accept odds changes before placing');
    const isValid = validationErrors.length === 0;

    const place = useCallback(async () => {
        if (!isValid) return;
        setState(STATES.VALIDATING);
        try {
            setState(STATES.PLACING);
            const token = config.token || localStorage.getItem('ns_session_token') || '';
            const res = await fetch(`${getApiUrl()}/api/v1/bets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    bet_type: betType,
                    stake: parseFloat(stake),
                    currency: 'EUR',
                    legs: legs.map(l => ({ selection_id: l.selection_id, odds: l.odds }))
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Bet placement failed');
            setPlacedBet(data);
            setState(STATES.PLACED);
            setLegs([]);
            setStake('');
            sessionStorage.removeItem(SLIP_KEY);
        } catch (e) {
            setError(e.message);
            setState(STATES.FAILED);
        }
    }, [isValid, legs, stake, betType, config.token]);

    // Computed potential payout
    const totalOdds = legs.reduce((acc, l) => acc * (l.odds || 1), 1);
    const potentialPayout = stake ? (parseFloat(stake) * totalOdds).toFixed(2) : '0.00';

    return {
        state,
        legs,
        stake,
        setStake,
        betType,
        setBetType,
        add,
        remove,
        clear,
        place,
        isValid,
        validationErrors,
        placedBet,
        error,
        changedOdds,
        updateOdds,
        acceptOddsChange,
        totalOdds,
        potentialPayout,
        STATES
    };
};

// ── useCashOut ────────────────────────────────────────────────────────────────
export const useCashOut = (betId) => {
    const [cashOutValue, setCashOutValue] = useState(null);
    const [canCashOut, setCanCashOut] = useState(false);
    const [isRequesting, setIsRequesting] = useState(false);
    const [quoteId, setQuoteId] = useState(null);
    const [error, setError] = useState(null);

    const fetchQuote = useCallback(async () => {
        if (!betId) return;
        const token = localStorage.getItem('ns_session_token') || '';
        try {
            const res = await fetch(`${getApiUrl()}/api/v1/bets/${betId}/cash-out`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({})
            });
            if (!res.ok) { setCanCashOut(false); return; }
            const data = await res.json();
            setCashOutValue(data.cash_out_value);
            setQuoteId(data.quote_id);
            setCanCashOut(true);
        } catch (_) {
            setCanCashOut(false);
        }
    }, [betId]);

    // Poll every 5 seconds
    useEffect(() => {
        fetchQuote();
        const interval = setInterval(fetchQuote, 5000);
        return () => clearInterval(interval);
    }, [fetchQuote]);

    const request = useCallback(async () => {
        if (!canCashOut || !quoteId) return;
        setIsRequesting(true);
        const token = localStorage.getItem('ns_session_token') || '';
        try {
            const res = await fetch(`${getApiUrl()}/api/v1/bets/${betId}/cash-out`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ accept: true, quote_id: quoteId })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Cash-out failed');
            return data;
        } catch (e) {
            setError(e.message);
            throw e;
        } finally {
            setIsRequesting(false);
        }
    }, [betId, canCashOut, quoteId]);

    return { cashOutValue, canCashOut, request, isRequesting, error, refresh: fetchQuote };
};

// ── useBetHistory ─────────────────────────────────────────────────────────────
export const useBetHistory = ({ status } = {}) => {
    const [bets, setBets] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [nextCursor, setNextCursor] = useState(null);

    const fetch_ = useCallback(async () => {
        setIsLoading(true);
        const token = localStorage.getItem('ns_session_token') || '';
        try {
            const params = new URLSearchParams();
            if (status) params.set('status', status);
            const res = await fetch(`${getApiUrl()}/api/v1/bets/me?${params}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setBets(data.bets || []);
            setNextCursor(data.nextCursor || null);
        } catch (e) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    }, [status]);

    useEffect(() => { fetch_(); }, [fetch_]);

    return { bets, isLoading, error, nextCursor, refresh: fetch_ };
};
