import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import ConfirmationModal from './ConfirmationModal';

describe('ConfirmationModal', () => {
  it('renders title and children when visible={true}', () => {
    const { getByText } = render(
      <ConfirmationModal
        visible={true}
        title="Delete Deck?"
        onCancel={() => {}}
        onConfirm={() => {}}
      >
        <Text>Are you sure?</Text>
      </ConfirmationModal>
    );
    expect(getByText('Delete Deck?')).toBeTruthy();
    expect(getByText('Are you sure?')).toBeTruthy();
  });

  it('calls onCancel when Cancel pressed', () => {
    const onCancel = jest.fn();
    const { getByText } = render(
      <ConfirmationModal
        visible={true}
        title="Test"
        onCancel={onCancel}
        onConfirm={() => {}}
      >
        <Text>body</Text>
      </ConfirmationModal>
    );
    fireEvent.press(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm when Confirm pressed', () => {
    const onConfirm = jest.fn();
    const { getByText } = render(
      <ConfirmationModal
        visible={true}
        title="Test"
        onCancel={() => {}}
        onConfirm={onConfirm}
      >
        <Text>body</Text>
      </ConfirmationModal>
    );
    fireEvent.press(getByText('Confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows custom confirmLabel', () => {
    const { getByText } = render(
      <ConfirmationModal
        visible={true}
        title="Test"
        onCancel={() => {}}
        onConfirm={() => {}}
        confirmLabel="Delete"
      >
        <Text>body</Text>
      </ConfirmationModal>
    );
    expect(getByText('Delete')).toBeTruthy();
  });

  it('defaults to "Confirm" when confirmLabel omitted', () => {
    const { getByText } = render(
      <ConfirmationModal
        visible={true}
        title="Test"
        onCancel={() => {}}
        onConfirm={() => {}}
      >
        <Text>body</Text>
      </ConfirmationModal>
    );
    expect(getByText('Confirm')).toBeTruthy();
  });
});
