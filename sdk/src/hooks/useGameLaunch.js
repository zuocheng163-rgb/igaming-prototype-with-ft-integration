import { useState, useEffect, useRef } from 'react';
import { useNeoStrike } from '../NeoStrikeProvider';

export const useGameLaunch = (gameId, options = {}) => {
    const { client } = useNeoStrike();
    const [launchUrl, setLaunchUrl] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const cache = useRef({});

    useEffect(() => {
        if (!gameId) {
            setLaunchUrl(null);
            setIsLoading(false);
            setError(null);
            return;
        }

        // Reset state for new gameId to avoid stale URLs
        setLaunchUrl(null);
        setError(null);

        // neostrike-demo: resolve immediately without backend call
        if (gameId === 'neostrike-demo') {
            const mode = options.mode || 'demo';
            const cacheKey = `${gameId}-${mode}`;
            const localUrl = `/demo-slot.html?mode=${mode}`;
            cache.current[cacheKey] = localUrl;
            setLaunchUrl(localUrl);
            return;
        }

        if (!client) return;

        const mode = options.mode || 'real';
        const cacheKey = `${gameId}-${mode}`;

        if (cache.current[cacheKey]) {
            setLaunchUrl(cache.current[cacheKey]);
            return;
        }

        const fetchLaunch = async () => {
            setIsLoading(true);
            setError(null);
            try {
                if (gameId === 'neostrike-demo') {
                    // Already handled above, this block is no longer needed
                    return;
                } else {
                    const data = await client.getGameLaunchUrl(gameId, { mode, ...options });
                    if (data && data.url) {
                        setLaunchUrl(data.url);
                        cache.current[cacheKey] = data.url;
                    }
                }
            } catch (err) {
                if (err.response?.data?.code === 'DEMO_NOT_SUPPORTED' || err.response?.data?.message?.includes('DEMO_NOT_SUPPORTED')) {
                    setError('DEMO_NOT_SUPPORTED');
                } else {
                    setError(err.message || 'Failed to launch game');
                }
            } finally {
                setIsLoading(false);
            }
        };

        fetchLaunch();
    }, [gameId, options.mode, client]);

    return { launchUrl, isLoading, error };
};
