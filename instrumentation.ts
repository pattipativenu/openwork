/**
 * Next.js Instrumentation Entry Point
 * 
 * This file is automatically loaded by Next.js to initialize instrumentation.
 * It initializes OpenTelemetry to send traces to Arize Phoenix.
 * 
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
    // Only run on the server side
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        try {
            const { initObservability } = await import('./lib/otel');
            await initObservability();
        } catch (error) {
            console.error('Failed to initialize observability:', error);
        }
    }
}
