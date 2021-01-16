import React, { useState } from 'react';
import styled from 'styled-components';

import mimc from './mimc';
import { verifyHash } from './prover';

import TextInput from './shared/components/TextInput';
import { Button } from './shared/components/Button';
import { Large } from './shared/components/text';


const Wrapper = styled.div`
  display: flex;
  flex-direction: row;
`;

const Spacer = styled.div`
  height: 30px;
`;

const Header = styled.p`
  width: 100px;
  padding-left: 5px;
`;

const Output = styled.p`
  width: 100%;
`;

const Page = (props) => {
  const [preImage1, setPreImage1] = useState(null);
  const [hashOut, setHashOut] = useState(null);
  const [preImage2, setPreImage2] = useState(null);
  const [hashIn, setHashIn] = useState(null);
  const [result, setResult] = useState(null);

  const handleEnterHash = async () => {
    const out = mimc(preImage1);
    setHashOut(out.toString());
    setHashIn(out.toString());
  };

  const handleEnterProve = async () => {
    const res = await verifyHash(preImage2, hashIn);
    setResult(res.toString());
  };

  const onChange = (stateSetter) => (value) => {
    stateSetter(value);
  };

  return (
    <>
      <>
        <Large>Compute the MiMC Hash</Large>
        <Wrapper>
          <Header>Pre-Image</Header>
          <TextInput
            placeholder={null}
            handleEnter={handleEnterHash}
            onChange={onChange(setPreImage1)}
            value={preImage1}
          />
        </Wrapper>
        <Button onClick={handleEnterHash}>
          Compute Hash 
        </Button>
        <Wrapper>
    	    <Header>Hash</Header>
          <Output>{hashOut}</Output>
        </Wrapper>
      </>
      <Spacer />
      <>
        <Large>Prove you know the pre-image of the MiMC Hash</Large>
        <Wrapper>
          <Header>Pre-Image</Header>
          <TextInput
            placeholder={null}
            onChange={onChange(setPreImage2)}
            value={preImage2}
          />
        </Wrapper>
        <Wrapper>
          <Header>Hash</Header>
          <TextInput
            placeholder={hashIn}
            onChange={onChange(setHashIn)}
            value={hashIn}
          />
        </Wrapper>
        <Button onClick={handleEnterProve}>
          Compute Proof
        </Button>
        <Wrapper>
          <Header>Result:</Header>
          <Output>{result}</Output>
        </Wrapper>
      </>
    </>
  );
}

export default Page;
