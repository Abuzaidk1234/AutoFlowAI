# math_server.py
from mcp.server.fastmcp import FastMCP
import math
import ast
import operator

mcp = FastMCP("Math")

# Safely evaluate mathematical expressions
allowed_operators = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
    ast.Div: operator.truediv, ast.Pow: operator.pow, ast.BitXor: operator.xor,
    ast.USub: operator.neg
}

def safe_eval(expr, node=None):
    if node is None:
        node = ast.parse(expr, mode='eval').body
    if isinstance(node, ast.Num):
        return node.n
    elif isinstance(node, ast.BinOp):
        return allowed_operators[type(node.op)](safe_eval(expr, node.left), safe_eval(expr, node.right))
    elif isinstance(node, ast.UnaryOp):
        return allowed_operators[type(node.op)](safe_eval(expr, node.operand))
    else:
        raise TypeError(f"Unsupported mathematical operation")

@mcp.tool()
def evaluate_math_expression(expression: str) -> str:
    """Evaluate a complex mathematical expression like '(5 + 3) * 10' or '100 / 2'."""
    try:
        result = safe_eval(expression)
        return str(result)
    except Exception as e:
        return f"Error evaluating expression: {e}"

@mcp.tool()
def add(a: float, b: float) -> float:
    """Add two numbers"""
    return a + b

@mcp.tool()
def multiply(a: float, b: float) -> float:
    """Multiply two numbers"""
    return a * b

@mcp.tool()
def subtract(a: float, b: float) -> float:
    """Subtract b from a"""
    return a - b

@mcp.tool()
def divide(a: float, b: float) -> float:
    """Divide a by b"""
    if b == 0:
        return float('inf')
    return a / b

@mcp.tool()
def square_root(a: float) -> float:
    """Calculate the square root of a number"""
    if a < 0:
        return float('nan')
    return math.sqrt(a)

if __name__ == "__main__":
    mcp.run(transport="stdio")