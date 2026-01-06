/**
 * Implementation A: Iterative approach using a for loop
 *
 * Time Complexity: O(n) - iterates through all numbers from 1 to n
 * Space Complexity: O(1) - uses only a single variable for accumulation
 *
 * Efficiency: Simple and straightforward, good for small to medium values of n.
 * Easy to understand and debug.
 */
function sum_to_n_a(n: number): number {
    let sum = 0;
    for (let i = 1; i <= n; i++) {
        sum += i;
    }
    return sum;
}

/**
 * Implementation B: Mathematical formula approach (Gauss's formula)
 *
 * Time Complexity: O(1) - constant time, single calculation
 * Space Complexity: O(1) - no additional space needed
 *
 * Efficiency: Most efficient solution. Uses the arithmetic series sum formula: n * (n + 1) / 2
 * Best choice for performance, especially with large values of n.
 */
function sum_to_n_b(n: number): number {
    if (n <= 0) {
        return 0;
    }
    return (n * (n + 1)) / 2;
}

/**
 * Implementation C: Recursive approach
 *
 * Time Complexity: O(n) - makes n recursive calls
 * Space Complexity: O(n) - call stack grows with n recursive calls
 *
 * Efficiency: Least efficient due to call stack overhead and risk of stack overflow
 * with large n values. Elegant but impractical for production use.
 * Not recommended for large inputs due to stack limitations.
 */
function sum_to_n_c(n: number): number {
    if (n <= 0) {
        return 0;
    }
    return n + sum_to_n_c(n - 1);
}

export { sum_to_n_a, sum_to_n_b, sum_to_n_c };
