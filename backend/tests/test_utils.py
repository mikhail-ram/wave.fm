import pytest
import numpy as np
from core.utils import dot_product

def test_dot_product():
    a = np.array([1.0, 0.0, 0.0])
    b = np.array([0.0, 1.0, 0.0])
    assert dot_product(a, b) == 0.0

    a = np.array([1.0, 0.0])
    b = np.array([1.0, 0.0])
    assert dot_product(a, b) == 1.0

    a = np.array([0.5, 0.5])
    b = np.array([-0.5, 0.5])
    assert dot_product(a, b) == 0.0
