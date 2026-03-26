import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import FilterPill from './FilterPill';
import { colors } from '../constants/colors';

describe('FilterPill', () => {
  it('renders label text', () => {
    const { getByText } = render(
      <FilterPill label="Pending" active={false} onPress={() => {}} />
    );
    expect(getByText('Pending')).toBeTruthy();
  });

  it('applies active styles when active={true}', () => {
    const { getByTestId, getByText } = render(
      <FilterPill label="All" active={true} onPress={() => {}} />
    );
    const pill = getByTestId('filter-all');
    const text = getByText('All');

    const pillStyle = Array.isArray(pill.props.style)
      ? Object.assign({}, ...pill.props.style.filter(Boolean))
      : pill.props.style;
    expect(pillStyle.backgroundColor).toBe(colors.primary);

    const textStyle = Array.isArray(text.props.style)
      ? Object.assign({}, ...text.props.style.filter(Boolean))
      : text.props.style;
    expect(textStyle.color).toBe(colors.textPrimary);
  });

  it('applies inactive styles when active={false}', () => {
    const { getByTestId, getByText } = render(
      <FilterPill label="Matched" active={false} onPress={() => {}} />
    );
    const pill = getByTestId('filter-matched');
    const text = getByText('Matched');

    const pillStyle = Array.isArray(pill.props.style)
      ? Object.assign({}, ...pill.props.style.filter(Boolean))
      : pill.props.style;
    expect(pillStyle.backgroundColor).toBe(colors.surfaceLight);

    const textStyle = Array.isArray(text.props.style)
      ? Object.assign({}, ...text.props.style.filter(Boolean))
      : text.props.style;
    expect(textStyle.color).toBe(colors.textSecondary);
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <FilterPill label="Skipped" active={false} onPress={onPress} />
    );
    fireEvent.press(getByText('Skipped'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
