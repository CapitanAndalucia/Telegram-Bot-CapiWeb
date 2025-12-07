export class ApiError extends Error {
    constructor(
        message: string,
        public status: number,
        public payload?: any
    ) {
        super(message);
        this.name = 'ApiError';
    }
}
