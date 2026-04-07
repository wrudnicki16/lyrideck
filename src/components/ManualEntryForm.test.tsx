import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ManualEntryForm from './ManualEntryForm';

describe('ManualEntryForm', () => {
  it('renders title and link inputs with + Add note button', () => {
    const { getByTestId, queryByTestId } = render(
      <ManualEntryForm onSave={jest.fn()} onCancel={jest.fn()} />
    );
    expect(getByTestId('input-manual-title')).toBeTruthy();
    expect(getByTestId('input-manual-link')).toBeTruthy();
    expect(getByTestId('add-note-btn')).toBeTruthy();
    expect(queryByTestId('input-manual-notes')).toBeNull();
  });

  it('reveals notes textarea when + Add note pressed', () => {
    const { getByTestId, queryByTestId } = render(
      <ManualEntryForm onSave={jest.fn()} onCancel={jest.fn()} />
    );
    fireEvent.press(getByTestId('add-note-btn'));
    expect(getByTestId('input-manual-notes')).toBeTruthy();
    expect(queryByTestId('add-note-btn')).toBeNull();
  });

  it('pre-fills fields from initial prop', () => {
    const { getByTestId } = render(
      <ManualEntryForm
        initial={{ title: 'Despacito', url: 'https://foo', notes: '' }}
        onSave={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(getByTestId('input-manual-title').props.value).toBe('Despacito');
    expect(getByTestId('input-manual-link').props.value).toBe('https://foo');
  });

  it('shows notes expanded when initial.notes is non-empty', () => {
    const { getByTestId, queryByTestId } = render(
      <ManualEntryForm
        initial={{ title: '', url: '', notes: 'some note' }}
        onSave={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(getByTestId('input-manual-notes').props.value).toBe('some note');
    expect(queryByTestId('add-note-btn')).toBeNull();
  });

  it('disables Save when both title and link are empty', () => {
    const onSave = jest.fn();
    const { getByTestId } = render(
      <ManualEntryForm onSave={onSave} onCancel={jest.fn()} />
    );
    fireEvent.press(getByTestId('save-manual-btn'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('disables Save when title and link are whitespace only', () => {
    const onSave = jest.fn();
    const { getByTestId } = render(
      <ManualEntryForm
        initial={{ title: '   ', url: '  ', notes: '' }}
        onSave={onSave}
        onCancel={jest.fn()}
      />
    );
    fireEvent.press(getByTestId('save-manual-btn'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('enables Save when only title is provided', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(
      <ManualEntryForm onSave={onSave} onCancel={jest.fn()} />
    );
    fireEvent.changeText(getByTestId('input-manual-title'), 'Despacito');
    fireEvent.press(getByTestId('save-manual-btn'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      title: 'Despacito',
      url: '',
      notes: '',
    });
  });

  it('enables Save when only link is provided', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(
      <ManualEntryForm onSave={onSave} onCancel={jest.fn()} />
    );
    fireEvent.changeText(getByTestId('input-manual-link'), 'https://foo');
    fireEvent.press(getByTestId('save-manual-btn'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      title: '',
      url: 'https://foo',
      notes: '',
    });
  });

  it('trims whitespace from title, url, and notes when saving', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(
      <ManualEntryForm onSave={onSave} onCancel={jest.fn()} />
    );
    fireEvent.changeText(getByTestId('input-manual-title'), '  Despacito  ');
    fireEvent.changeText(getByTestId('input-manual-link'), '  https://foo  ');
    fireEvent.press(getByTestId('add-note-btn'));
    fireEvent.changeText(getByTestId('input-manual-notes'), '  a note  ');
    fireEvent.press(getByTestId('save-manual-btn'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      title: 'Despacito',
      url: 'https://foo',
      notes: 'a note',
    });
  });

  it('calls onCancel when Cancel pressed', () => {
    const onCancel = jest.fn();
    const { getByTestId } = render(
      <ManualEntryForm onSave={jest.fn()} onCancel={onCancel} />
    );
    fireEvent.press(getByTestId('cancel-manual-btn'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('hides open-link icon when link is empty', () => {
    const { queryByTestId } = render(
      <ManualEntryForm onSave={jest.fn()} onCancel={jest.fn()} />
    );
    expect(queryByTestId('open-manual-link')).toBeNull();
  });

  it('hides open-link icon when link is plain text', () => {
    const { getByTestId, queryByTestId } = render(
      <ManualEntryForm onSave={jest.fn()} onCancel={jest.fn()} />
    );
    fireEvent.changeText(getByTestId('input-manual-link'), 'not a url');
    expect(queryByTestId('open-manual-link')).toBeNull();
  });

  it('shows open-link icon for https URL', () => {
    const { getByTestId } = render(
      <ManualEntryForm onSave={jest.fn()} onCancel={jest.fn()} />
    );
    fireEvent.changeText(
      getByTestId('input-manual-link'),
      'https://youtu.be/abc'
    );
    expect(getByTestId('open-manual-link')).toBeTruthy();
  });

  it('shows open-link icon for spotify: URI', () => {
    const { getByTestId } = render(
      <ManualEntryForm onSave={jest.fn()} onCancel={jest.fn()} />
    );
    fireEvent.changeText(
      getByTestId('input-manual-link'),
      'spotify:track:abc'
    );
    expect(getByTestId('open-manual-link')).toBeTruthy();
  });
});
