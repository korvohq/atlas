import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import path from 'path';

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const schemasDir = path.join(__dirname, '..', 'schemas');

/* eslint-disable @typescript-eslint/no-var-requires */
const questionSchema = require(path.join(schemasDir, 'question.json'));
const sourceSchema = require(path.join(schemasDir, 'source.json'));
const claimSchema = require(path.join(schemasDir, 'claim.json'));
const artifactSchema = require(path.join(schemasDir, 'artifact.json'));
const validatorSchema = require(path.join(schemasDir, 'validator.json'));

export const validateQuestion = ajv.compile(questionSchema);
export const validateSource = ajv.compile(sourceSchema);
export const validateClaim = ajv.compile(claimSchema);
export const validateArtifact = ajv.compile(artifactSchema);
export const validateValidator = ajv.compile(validatorSchema);
